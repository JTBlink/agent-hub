use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

mod replacement;

/// Refuse to sync when `src` and `dst` overlap in either direction (equal,
/// dst inside src, or src inside dst). Otherwise the recursive copy walks
/// into the freshly-created `dst` and produces unbounded nesting (issue #61),
/// or the pre-copy removal of `dst` deletes the source along with it (#199).
///
/// `src` must exist and canonicalize — every caller is about to read from it,
/// and all destructive steps (remove target / remove destination) happen after
/// this check, so failing here protects the existing target. A missing `dst`
/// is the normal case for a fresh install and is judged via its parent.
///
/// A `dst` that is itself a link is judged by its own location (parent + name),
/// never by what it resolves to. Resolving it would report our own deployed
/// link as "inside the source" and refuse — which is what broke switching an
/// already-deployed skill from symlink to copy mode. Removing that link cannot
/// touch the source (links are unlinked, not followed), so its pointee is
/// irrelevant to both hazards this guard exists for.
pub(crate) fn ensure_dst_not_inside_src(src: &Path, dst: &Path) -> Result<()> {
    // Same path, before any link-aware special casing below: if `src` is itself
    // a link, judging `dst` lexically and `src` canonically would compare a link
    // against its pointee and miss the equality. Unlinking `dst` would then
    // destroy `src`, and the copy would "succeed" from the empty directory it
    // just created in its place.
    if src == dst {
        anyhow::bail!(
            "Source and destination are the same path {:?}; refusing to copy",
            src
        );
    }
    let src_canon = src
        .canonicalize()
        .with_context(|| format!("Source {:?} does not exist or is not accessible", src))?;
    let dst_is_link = std::fs::symlink_metadata(dst)
        .map(|meta| meta.file_type().is_symlink())
        .unwrap_or(false);
    let lexical_dst = || -> Option<PathBuf> {
        let parent = dst.parent()?.canonicalize().ok()?;
        let name = dst.file_name()?;
        Some(parent.join(name))
    };
    let dst_canon: Option<PathBuf> = if dst_is_link {
        lexical_dst()
    } else {
        dst.canonicalize().ok().or_else(lexical_dst)
    };
    // The same link reached by two spellings (`./x` vs `x`) is still the same
    // object, and the lexical/canonical mismatch above would hide it.
    if dst_is_link {
        let lexical_src = || -> Option<PathBuf> {
            let parent = src.parent()?.canonicalize().ok()?;
            Some(parent.join(src.file_name()?))
        };
        if let (Some(a), Some(b)) = (lexical_src(), dst_canon.as_ref()) {
            if a == *b {
                anyhow::bail!(
                    "Source and destination are the same path {:?}; refusing to copy",
                    src
                );
            }
        }
    }
    if let Some(dst_canon) = dst_canon {
        if dst_canon.starts_with(&src_canon) {
            anyhow::bail!(
                "Destination {:?} is inside source {:?}; refusing to copy to avoid infinite recursion",
                dst,
                src
            );
        }
        if src_canon.starts_with(&dst_canon) {
            anyhow::bail!(
                "Source {:?} is inside destination {:?}; refusing to avoid deleting the source",
                src,
                dst
            );
        }
    }
    Ok(())
}

/// What is actually sitting at a deployment target right now.
///
/// Classified from `symlink_metadata` only — never `is_dir()`, which follows
/// links and would report a Windows junction or a directory symlink as a real
/// directory, sending it down the `remove_dir_all` path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetState {
    /// Nothing there. Deploying cannot destroy anything.
    Absent,
    /// A link that resolves to the source we are about to deploy — ours by
    /// construction, and unlinking it cannot touch the source.
    LinkToSource,
    /// A link pointing somewhere else, or a dangling one. The link itself is
    /// user configuration even when its pointee is gone.
    ForeignLink,
    /// A real directory. Indistinguishable from a copy-mode deployment by
    /// filesystem inspection alone.
    RealDir,
    /// A real file. We never deploy a bare file, so this is always the user's.
    RealFile,
}

/// What the caller is authorized to destroy at the target.
///
/// This is an enum rather than a bool so that adding it to `sync_skill` breaks
/// every call site and forces each one to state its intent — the property worth
/// having in a fix for silent data loss (issue #363).
#[derive(Debug, Clone, Copy)]
pub enum ReplacePolicy<'a> {
    /// Only proceed when nothing of the user's can be lost. Anything we cannot
    /// prove is ours is refused.
    NoClobber,
    /// The caller found a `skill_targets` row claiming exactly this path.
    ///
    /// The row is historical intent, not proof of what is on disk now, so it
    /// only authorizes removing an object whose *current* type matches the
    /// recorded mode: a row saying `symlink` must never authorize deleting a
    /// real directory that replaced our link.
    Recorded { mode: &'a str },
    /// Explicit user intent: adopt an existing directory into the library,
    /// `--force`, or "update this copy from center".
    UserConfirmed,
}

impl ReplacePolicy<'_> {
    /// Whether this policy authorizes destroying `state`. See the module tests
    /// for the full decision table.
    fn permits(&self, state: TargetState) -> bool {
        match state {
            // Nothing to lose either way.
            TargetState::Absent | TargetState::LinkToSource => true,
            TargetState::ForeignLink => match self {
                ReplacePolicy::NoClobber => false,
                // Our own link can dangle after the library moves, so a
                // symlink row still authorizes replacing a link. A copy row
                // does not: something turned our directory into a link.
                ReplacePolicy::Recorded { mode } => *mode == "symlink",
                ReplacePolicy::UserConfirmed => true,
            },
            TargetState::RealDir => match self {
                ReplacePolicy::NoClobber => false,
                ReplacePolicy::Recorded { mode } => *mode == "copy",
                ReplacePolicy::UserConfirmed => true,
            },
            // We never deploy a bare file, so no record can vouch for one.
            TargetState::RealFile => matches!(self, ReplacePolicy::UserConfirmed),
        }
    }

    fn describe(&self) -> &'static str {
        match self {
            ReplacePolicy::NoClobber => "不由 AgentHub 管理",
            ReplacePolicy::Recorded { .. } => "与已记录的部署不一致",
            ReplacePolicy::UserConfirmed => "无法被替换",
        }
    }
}

/// A write was refused because the target is not ours to destroy.
///
/// A distinct type so callers can tell an ownership refusal — where the right
/// response is to report the conflict to the user — from an ordinary IO error,
/// which reconcile paths have always tolerated and logged.
#[derive(Debug)]
pub struct ReplaceRefused {
    pub target: PathBuf,
    pub reason: &'static str,
}

/// The one place this refusal is worded. `ReplaceRefused` and the
/// `TargetConflict` that carries it out to callers both render through here so
/// the two cannot drift apart.
pub fn refusal_message(target: &Path, reason: &str) -> String {
    format!(
        "拒绝替换 {target:?}：该路径{reason}。已有内容未被修改——\
         请先将其导入技能库或移至其他位置后重试。"
    )
}

impl std::fmt::Display for ReplaceRefused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&refusal_message(&self.target, self.reason))
    }
}

impl std::error::Error for ReplaceRefused {}

/// Classify `target` and check `policy` against it, returning the state that
/// may then be removed. The single place the refusal decision and its wording
/// live, so `sync_skill` and [`preflight_replace`] can never disagree.
fn authorize_replacement(
    source: &Path,
    target: &Path,
    policy: ReplacePolicy<'_>,
) -> Result<TargetState> {
    let state = classify_target(target, Some(source))?;
    if !policy.permits(state) {
        return Err(ReplaceRefused {
            target: target.to_path_buf(),
            reason: policy.describe(),
        }
        .into());
    }
    Ok(state)
}

/// Whether [`sync_skill`] would be allowed to write here, without touching
/// anything. For batch callers that must refuse the whole operation before
/// mutating any of it (#363, expectation 4).
///
/// This is a preflight, not an authorization: `sync_skill` re-checks
/// immediately before it removes anything, because the filesystem can change
/// in between.
pub fn preflight_replace(
    source: &Path,
    target: &Path,
    mode: SyncMode,
    policy: ReplacePolicy<'_>,
) -> Result<()> {
    if is_target_current(source, target, mode, None, None) {
        return Ok(());
    }
    authorize_replacement(source, target, policy).map(|_| ())
}

/// Classify what is at `target` without following links.
///
/// `source` is the deployment source, used only to recognize a link that already
/// points at it. Pass `None` when there is no source to compare against.
pub fn classify_target(target: &Path, source: Option<&Path>) -> Result<TargetState> {
    let metadata = match std::fs::symlink_metadata(target) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(TargetState::Absent),
        // A target we cannot even stat is not evidence that it is ours.
        Err(err) => {
            return Err(anyhow::Error::from(err)
                .context(format!("Cannot inspect existing target {:?}", target)));
        }
    };

    if metadata.file_type().is_symlink() {
        // `LinkToSource` is universally permitted, so it must only be reached
        // with a real source to compare against. Callers with no source (undeploy
        // and friends) pass `None`: an empty path would canonicalize to the
        // process CWD and turn a user's link into "ours".
        if source.is_some_and(|source| symlink_points_to(target, source)) {
            return Ok(TargetState::LinkToSource);
        }
        return Ok(TargetState::ForeignLink);
    }
    if metadata.is_dir() {
        Ok(TargetState::RealDir)
    } else {
        Ok(TargetState::RealFile)
    }
}

#[derive(Debug, Clone, Copy)]
pub enum SyncMode {
    Symlink,
    Copy,
}

impl SyncMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            SyncMode::Symlink => "symlink",
            SyncMode::Copy => "copy",
        }
    }
}

pub fn sync_mode_for_tool(_tool_key: &str, configured_mode: Option<&str>) -> SyncMode {
    match configured_mode {
        Some("copy") => SyncMode::Copy,
        Some("symlink") => SyncMode::Symlink,
        _ => SyncMode::Symlink,
    }
}

pub fn target_dir_name(central_path: &Path, skill_name: &str) -> String {
    central_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| skill_name.to_string())
}

pub fn sync_skill(
    source: &Path,
    target: &Path,
    mode: SyncMode,
    policy: ReplacePolicy<'_>,
) -> Result<SyncMode> {
    // Internal self-check uses no hash context, so Copy mode always
    // proceeds — the caller (e.g. `sync_desired_targets`) is the place
    // that knows about freshness and can short-circuit.
    if is_target_current(source, target, mode, None, None) {
        return Ok(mode);
    }

    // Decide what we are allowed to destroy before touching anything. This
    // runs here, immediately before the removal, rather than only in a caller
    // preflight: a preflight result cannot authorize a later deletion (#363).
    let state = authorize_replacement(source, target, policy)?;

    // A real write to a watched dir follows: mute the watcher so this
    // app-initiated change doesn't echo back as a redundant refresh (#248).
    crate::core::file_watcher::mute_self_writes(target);

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create parent dir {:?}", parent))?;
    }

    ensure_dst_not_inside_src(source, target)?;

    replacement::replace(source, target, mode, policy, state)
}

/// Decide whether the existing target is already in the desired state.
///
/// - **Symlink mode**: the target must be a symlink pointing at `source`.
/// - **Copy mode**: the target must still exist on disk **and** the
///   previously synced source hash must equal the current source hash
///   (both must be `Some`). The existence check protects against a
///   user manually deleting the synced directory between sessions —
///   without it a stale hash would cause us to skip a re-copy the
///   user needs. Callers without hash context should pass `None`,
///   which preserves the historical "always recopy" behavior. See
///   `SkillTargetRecord.source_hash` and issue #153 for context.
pub(crate) fn is_library_entry(path: &Path) -> bool {
    let root = super::central_repo::skills_dir();
    let Ok(root) = root.canonicalize() else {
        return false;
    };
    path == root
        || path
            .parent()
            .and_then(|parent| parent.canonicalize().ok())
            .is_some_and(|parent| parent.starts_with(&root))
}

pub(crate) fn uses_library_directly(source: &Path, target: &Path) -> bool {
    is_library_entry(target)
        && source.is_dir()
        && source
            .canonicalize()
            .ok()
            .zip(target.canonicalize().ok())
            .is_some_and(|(a, b)| a == b)
}

pub fn is_target_current(
    source: &Path,
    target: &Path,
    mode: SyncMode,
    last_synced_source_hash: Option<&str>,
    current_source_hash: Option<&str>,
) -> bool {
    if uses_library_directly(source, target) {
        return true;
    }
    match mode {
        SyncMode::Symlink => symlink_points_to(target, source),
        SyncMode::Copy => match (last_synced_source_hash, current_source_hash) {
            (Some(stored), Some(current)) if stored == current => {
                std::fs::symlink_metadata(target).is_ok()
            }
            _ => false,
        },
    }
}

fn symlink_points_to(target: &Path, source: &Path) -> bool {
    let Ok(metadata) = std::fs::symlink_metadata(target) else {
        return false;
    };
    if !metadata.file_type().is_symlink() {
        return false;
    }

    let Ok(link_target) = std::fs::read_link(target) else {
        return false;
    };
    let resolved_link_target = if link_target.is_absolute() {
        link_target
    } else {
        target
            .parent()
            .unwrap_or_else(|| Path::new(""))
            .join(link_target)
    };

    if resolved_link_target == source {
        return true;
    }

    match (resolved_link_target.canonicalize(), source.canonicalize()) {
        (Ok(link), Ok(src)) => link == src,
        _ => false,
    }
}

/// Remove a target that was already classified, using an operation that only
/// works on that kind of object.
///
/// This is the difference between "we checked, then deleted whatever we found"
/// and "we deleted the thing we checked". If a real directory replaces a link
/// between the classification and this call, `remove_file` fails with an error
/// instead of `remove_dir_all` quietly eating it — the exact race that makes a
/// check-then-`remove_target` sequence still unsafe.
pub fn remove_classified_target(target: &Path, state: TargetState) -> Result<()> {
    match state {
        TargetState::Absent => Ok(()),
        TargetState::LinkToSource | TargetState::ForeignLink => {
            crate::core::file_watcher::mute_self_writes(target);
            remove_link(target)
        }
        TargetState::RealFile => {
            crate::core::file_watcher::mute_self_writes(target);
            std::fs::remove_file(target).map_err(Into::into)
        }
        TargetState::RealDir => {
            crate::core::file_watcher::mute_self_writes(target);
            // Only reachable via `Recorded { mode: "copy" }` or UserConfirmed.
            std::fs::remove_dir_all(target).map_err(Into::into)
        }
    }
}

/// Remove a deployment target only while what is on disk still matches the
/// deployment we recorded. Returns `false` when the object was preserved
/// because it no longer does.
///
/// Undeploy and cleanup paths reach a path through a `skill_targets` row, and
/// a row is a statement about the past: if the user replaced our link with a
/// real directory of their own, the row still points at it. Removing on the
/// row's word alone deletes that directory (#363, expectation 5).
///
/// Link-vs-source identity is irrelevant here — a `symlink` row authorizes
/// removing a link whether or not it still resolves to the skill we deployed
/// (the library may have moved) — so no source path is required.
pub fn remove_recorded_target(target: &Path, recorded_mode: &str) -> Result<bool> {
    if is_library_entry(target) {
        return Ok(false);
    }
    let state = classify_target(target, None)?;
    let policy = ReplacePolicy::Recorded {
        mode: recorded_mode,
    };
    if !policy.permits(state) {
        return Ok(false);
    }
    remove_classified_target(target, state)?;
    Ok(true)
}

/// Row-driven removal for cleanup paths: remove only while the disk still
/// matches the record, and report a preserved replacement instead of falling
/// back to [`remove_target`]. Every caller that deletes what a `skill_targets`
/// row points at should go through here (or [`remove_recorded_target`]) — a
/// row is a statement about the past, never proof that whatever is on disk is
/// ours (#363 expectation 5, #435).
pub fn remove_recorded_target_or_warn(target: &Path, recorded_mode: &str) -> bool {
    match remove_recorded_target(target, recorded_mode) {
        Ok(true) => true,
        Ok(false) => {
            log::warn!(
                "Preserving {}: no longer matches its recorded {recorded_mode} deployment; \
                 removing the record only",
                target.display()
            );
            false
        }
        Err(e) => {
            log::warn!("Failed to remove sync target {}: {e}", target.display());
            false
        }
    }
}

/// Whether what is at `target` is still consistent with a deployment recorded
/// as `recorded_mode`. `false` means something else took the path over, which
/// is why an undeploy may leave a path behind on purpose.
pub fn matches_recorded_deployment(target: &Path, recorded_mode: &str) -> Result<bool> {
    let state = classify_target(target, None)?;
    if state == TargetState::Absent {
        return Ok(false);
    }
    let policy = ReplacePolicy::Recorded {
        mode: recorded_mode,
    };
    Ok(policy.permits(state))
}

/// Unlink a symlink (or, on Windows, a directory symlink / junction) without
/// following it.
pub(crate) fn remove_link(target: &Path) -> Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::FileTypeExt;
        let metadata = match std::fs::symlink_metadata(target) {
            Ok(metadata) => metadata,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(err) => return Err(err.into()),
        };
        if !metadata.file_type().is_symlink() {
            anyhow::bail!(
                "Refusing to remove {:?}: expected a link but found a real file or directory",
                target
            );
        }
        // `remove_dir` on a directory link removes the link, not its contents.
        if metadata.file_type().is_symlink_dir() {
            std::fs::remove_dir(target)?;
        } else {
            std::fs::remove_file(target)?;
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        // `remove_file` unlinks a symlink of either kind and refuses a real
        // directory outright, which is precisely the guarantee wanted here.
        match std::fs::remove_file(target) {
            Ok(()) => Ok(()),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(err) => Err(err.into()),
        }
    }
}

/// Unconditional removal of whatever is at `target`.
///
/// **Unchecked**: this will `remove_dir_all` a real directory regardless of
/// whose it is. Deployment paths must go through [`remove_classified_target`]
/// (or [`sync_skill`]) instead; this remains for callers that have already
/// established ownership another way.
pub fn remove_target(target: &Path) -> Result<()> {
    let metadata = match std::fs::symlink_metadata(target) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(err.into()),
    };

    // An actual removal from a watched dir follows: mute the self-write echo.
    crate::core::file_watcher::mute_self_writes(target);

    if metadata.file_type().is_symlink() {
        #[cfg(windows)]
        {
            use std::os::windows::fs::FileTypeExt;
            // Decide from the link's own metadata: `target.is_dir()` follows
            // the link, so a dangling directory symlink/junction would be
            // misclassified as a file and `remove_file` would fail, leaving
            // a broken link behind.
            if metadata.file_type().is_symlink_dir() {
                std::fs::remove_dir(target)?;
            } else {
                std::fs::remove_file(target)?;
            }
        }
        #[cfg(not(windows))]
        {
            std::fs::remove_file(target)?;
        }
    } else if metadata.is_dir() {
        std::fs::remove_dir_all(target)?;
    } else {
        std::fs::remove_file(target)?;
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ft = entry.file_type()?;
        let dest_path = dst.join(entry.file_name());
        if ft.is_dir() {
            let name = entry.file_name();
            if name == ".git" {
                continue;
            }
            copy_dir_recursive(&entry.path(), &dest_path)?;
        } else {
            std::fs::copy(entry.path(), &dest_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "sync_engine/replacement_tests.rs"]
mod replacement_tests;

#[cfg(test)]
mod tests;
