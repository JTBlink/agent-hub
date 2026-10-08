use super::*;

pub(super) fn directory_has_entries(path: &Path) -> Result<bool> {
    if !path.exists() {
        return Ok(false);
    }
    Ok(fs::read_dir(path)?.next().is_some())
}

pub(super) fn copy_dir_recursive(source: &Path, target: &Path) -> Result<()> {
    for entry in WalkDir::new(source) {
        let entry = entry?;
        let relative = entry.path().strip_prefix(source)?;
        let destination = target.join(relative);
        if entry.file_type().is_symlink() {
            copy_symlink(entry.path(), &destination)?;
        } else if entry.file_type().is_dir() {
            fs::create_dir_all(&destination)?;
        } else {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(entry.path(), &destination).with_context(|| {
                format!(
                    "Failed to copy {} to {}",
                    entry.path().display(),
                    destination.display()
                )
            })?;
        }
    }
    Ok(())
}

/// Recreate a link as a link. Following it would turn a file link into a copy
/// and fail outright on a directory link, aborting a cross-volume move.
pub(super) fn copy_symlink(source: &Path, destination: &Path) -> Result<()> {
    let link = fs::read_link(source)?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink(&link, destination)?;
    #[cfg(windows)]
    {
        if fs::metadata(source).map(|m| m.is_dir()).unwrap_or(false) {
            std::os::windows::fs::symlink_dir(&link, destination)?;
        } else {
            std::os::windows::fs::symlink_file(&link, destination)?;
        }
    }
    Ok(())
}

/// Files the app recreates on its own. A target holding nothing else is not a
/// library: it is what an earlier session or the CLI bridge left behind.
const REGENERABLE_ROOT_FILES: &[&str] = &[".agent-hub.lock", "git-askpass.sh"];
/// OS metadata, debris wherever it appears.
const OS_METADATA_FILES: &[&str] = &[".DS_Store", "Thumbs.db", "desktop.ini"];

/// Whether `path` can be dropped safely: a regenerable file, the CLI bridge's
/// files in the default home's `bin/` (republished at every launch, so they
/// must not block moving the library back home), or a directory holding only
/// such things. Links are never followed or counted as debris, and anything
/// that cannot be inspected is kept.
pub(super) fn is_regenerable(path: &Path, target: &Path) -> bool {
    let Ok(meta) = fs::symlink_metadata(path) else {
        return false;
    };
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if meta.is_file() {
        let parent = path.parent();
        let in_bridge_dir = parent == Some(crate::core::cli_bridge::bridge_dir().as_path());
        return OS_METADATA_FILES.contains(&name)
            || (parent == Some(target) && REGENERABLE_ROOT_FILES.contains(&name))
            || (in_bridge_dir && crate::core::cli_bridge::is_bridge_file(name));
    }
    if !meta.is_dir() {
        return false;
    }
    let Ok(entries) = fs::read_dir(path) else {
        return false;
    };
    entries
        .into_iter()
        .all(|entry| entry.is_ok_and(|entry| is_regenerable(&entry.path(), target)))
}

/// Remove debris from a migration target so the move can proceed. All-or-
/// nothing: if anything in it is not known debris, nothing is touched.
pub(super) fn clear_regenerable_target(target: &Path) -> Result<()> {
    let Ok(entries) = fs::read_dir(target) else {
        return Ok(());
    };
    let Ok(entries) = entries
        .map(|entry| entry.map(|e| e.path()))
        .collect::<std::io::Result<Vec<PathBuf>>>()
    else {
        return Ok(());
    };
    if !entries.iter().all(|path| is_regenerable(path, target)) {
        return Ok(());
    }
    for path in entries {
        if fs::symlink_metadata(&path)?.is_dir() {
            fs::remove_dir_all(&path)?;
        } else {
            fs::remove_file(&path)?;
        }
    }
    Ok(())
}

/// Whether two paths resolve to the same directory. Falls back to a lexical
/// comparison when either side can't be canonicalized (e.g. the target does not
/// exist yet), so a purely cosmetic difference (case, `8.3` names, a symlink)
/// isn't mistaken for a real relocation.
pub(super) fn paths_are_same_dir(a: &Path, b: &Path) -> bool {
    if a == b {
        return true;
    }
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(ca), Ok(cb)) => ca == cb,
        _ => false,
    }
}

/// Move by copying into the (empty) target, for when a rename can't (another
/// volume). On failure the partial copy is removed — everything in the target
/// is ours, and left behind it would block every retry as "not empty". On
/// success the old copy is kept but set aside: left in place it looks like the
/// live library and blocks ever moving back to that path.
pub(super) fn move_by_copy(source: &Path, target: &Path) -> Result<()> {
    if let Err(err) = copy_dir_recursive(source, target) {
        if let Ok(entries) = fs::read_dir(target) {
            for entry in entries.flatten() {
                let path = entry.path();
                let _ = if entry.file_type().is_ok_and(|t| t.is_dir()) {
                    fs::remove_dir_all(&path)
                } else {
                    fs::remove_file(&path)
                };
            }
        }
        return Err(err);
    }
    let aside = source.with_file_name(format!(
        "{}.moved-{}",
        source
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("library"),
        chrono::Local::now().format("%Y%m%d-%H%M%S")
    ));
    if let Err(err) = fs::rename(source, &aside) {
        record_startup_error(format!(
            "central repo: copied the library to {}, but cannot set the old copy at {} aside ({err})",
            target.display(),
            source.display()
        ));
    }
    Ok(())
}

/// What the caller should do after attempting a pending central-repo move.
pub(super) enum MigrationOutcome {
    /// No move was pending, or it completed. Run against the configured base.
    Proceed,
    /// The move could not complete safely. The marker stays, so `base_dir()`
    /// keeps resolving to the intact source; the next launch retries.
    UseSource,
}

/// Try to satisfy a pending central-repository relocation.
///
/// This runs before the logger, the panic hook, and the window exist (see
/// `run()` in lib.rs), so it must never return an error that would panic the
/// process into a windowless death (#252). Every failure instead records a
/// startup warning + a deferred log line and falls back to the source, where
/// the user's data is known to be intact. It mutates `config` in place but
/// does NOT persist it — the caller saves once, which also keeps this unit
/// testable without touching the real config file.
pub(super) fn migrate_repo_if_needed(
    config: &mut RepoPathConfig,
    current_base: &Path,
) -> MigrationOutcome {
    let Some(source_raw) = config.pending_migration_from.clone() else {
        return MigrationOutcome::Proceed;
    };
    let source = match normalize_path(&source_raw) {
        Ok(path) => path,
        Err(err) => {
            // The stored path is unusable, so the move can never proceed. Drop
            // the marker to stop retrying every launch and run against target.
            record_startup_error(format!(
                "central repo: pending migration source {source_raw:?} is invalid ({err}); dropping it"
            ));
            config.pending_migration_from = None;
            return MigrationOutcome::Proceed;
        }
    };

    if source == home_base_dir().join("library")
        && current_base == home_base_dir()
        && (source.exists() || crate::core::library_layout::interrupted(current_base))
    {
        match crate::core::library_layout::flatten(&source, current_base) {
            Ok(()) => {
                config.pending_migration_from = None;
                config.repoint_from = Some(source.to_string_lossy().to_string());
                return MigrationOutcome::Proceed;
            }
            Err(err) => {
                record_startup_error(format!("central repo: default layout migration failed ({err:#}); keeping original library"));
                push_startup_warning("migration_incomplete");
                return MigrationOutcome::UseSource;
            }
        }
    }

    // Nothing left to move: the source is gone (moved already, or the old
    // location was removed), or source and target are the same directory.
    // Compare canonically, not just lexically — on a case-insensitive volume
    // `D:\Skills` and `d:\skills` are one directory (likewise 8.3 vs long, or a
    // symlink), and a lexical mismatch would otherwise loop forever on
    // `migration_incomplete`, telling the user to empty their own library.
    if !source.exists() || paths_are_same_dir(&source, current_base) {
        // A source that is gone while the target exists is a move that
        // finished but was never recorded (crash or failed config save right
        // after the rename): its links and DB paths still need repointing.
        if !source.exists() && current_base.is_dir() {
            config.repoint_from = Some(source.to_string_lossy().to_string());
        }
        config.pending_migration_from = None;
        return MigrationOutcome::Proceed;
    }

    // A target nested inside the source can never be a valid destination.
    if current_base.starts_with(&source) {
        record_startup_error(format!(
            "central repo: migration target {} is inside source {}; keeping data at the source",
            current_base.display(),
            source.display()
        ));
        push_startup_warning("migration_incomplete");
        return MigrationOutcome::UseSource;
    }

    // Only ever move into an absent/empty target — never blind-merge. A
    // non-empty target is either a real library we must not overwrite or debris
    // from a failed attempt we cannot tell apart; keeping the user on their
    // intact source is lossless, overwriting is not. A fresh target also means
    // the recursive copy only ever creates new files, so it can never hit the
    // read-only git pack files that overwriting bricked startup on (#252).
    if let Err(err) = clear_regenerable_target(current_base) {
        record_startup_error(format!(
            "central repo: cannot clear leftovers in migration target {} ({err})",
            current_base.display()
        ));
    }
    let target_empty = match directory_has_entries(current_base) {
        Ok(has_entries) => !has_entries,
        Err(err) => {
            record_startup_error(format!(
                "central repo: cannot inspect migration target {} ({err}); keeping data at source {}",
                current_base.display(),
                source.display()
            ));
            push_startup_warning("migration_incomplete");
            return MigrationOutcome::UseSource;
        }
    };
    if !target_empty {
        record_startup_error(format!(
            "central repo: migration target {} is not empty; keeping data at source {}",
            current_base.display(),
            source.display()
        ));
        push_startup_warning("migration_incomplete");
        return MigrationOutcome::UseSource;
    }

    if let Some(parent) = current_base.parent() {
        if let Err(err) = fs::create_dir_all(parent) {
            record_startup_error(format!(
                "central repo: cannot create migration target parent {} ({err}); keeping data at source {}",
                parent.display(),
                source.display()
            ));
            push_startup_warning("migration_incomplete");
            return MigrationOutcome::UseSource;
        }
    }

    // Same volume: an atomic rename moves the whole tree cheaply. Cross volume
    // (or a rename the OS refuses): copy into the empty target. Because the
    // target is empty, no existing file is ever overwritten.
    if fs::rename(&source, current_base).is_err() {
        if let Err(err) = move_by_copy(&source, current_base) {
            record_startup_error(format!(
                "central repo: migration copy from {} to {} failed ({err:#}); keeping data at source",
                source.display(),
                current_base.display()
            ));
            push_startup_warning("migration_incomplete");
            return MigrationOutcome::UseSource;
        }
    }

    config.pending_migration_from = None;
    config.repoint_from = Some(source.to_string_lossy().to_string());
    MigrationOutcome::Proceed
}
