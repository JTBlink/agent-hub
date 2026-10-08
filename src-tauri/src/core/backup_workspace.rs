//! Separate Git worktree from the shared live Skills library.
//! Callers hold RepoLock across projection, Git operations and publication.
mod files;
#[cfg(test)]
mod tests;
use super::{central_repo, git_backup, skill_store::SkillStore, sync_metadata};
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Component, Path, PathBuf},
};

const LAYOUT: &str = ".agent-hub/backup-layout.json";
const README: &str = "# Skills\n\nInstall all or selected skills with:\n\n```sh\nnpx skills@latest add <repository-url>\nnpx skills@latest add <repository-url> --skill <skill-name>\n```\n\nSkills are in `skills/`, each with its original `SKILL.md` and supporting files.\n`.agent-hub/` contains portable AgentHub sync metadata.\nPrivate repositories require Git access on the installing machine.\n";

/// Local backup Git repository; respects isolated app/CLI roots.
pub fn repo_dir() -> PathBuf {
    central_repo::base_dir().join("backup")
}
fn journal_path() -> PathBuf {
    central_repo::base_dir().join("backup-publication.json")
}

#[derive(Serialize, Deserialize)]
struct Journal {
    live_root: PathBuf,
    before: BTreeMap<String, String>,
    recovery: PathBuf,
}

/// Run a complete desktop or CLI operation under the shared library lock.
pub fn run<T>(
    store: &SkillStore,
    operation: &str,
    f: impl FnOnce(&Path) -> Result<T>,
) -> Result<T> {
    git_backup::with_repo_lock(operation, || run_unlocked(store, f))
}

pub(crate) fn run_unlocked<T>(store: &SkillStore, f: impl FnOnce(&Path) -> Result<T>) -> Result<T> {
    prepare_unlocked(store).context("Cannot prepare backup repository")?;
    let root = repo_dir();
    let result = f(&root);
    // A failed push may follow a successful merge. Publish that coherent local
    // result too, so a subsequent export cannot erase the merge.
    finish_unlocked(store).context("Cannot publish backup result to Skills")?;
    result
}

/// Projection for a read-only status refresh, without changing live content.
pub fn status(store: &SkillStore) -> Result<git_backup::GitBackupStatus> {
    run(store, "backup status", git_backup::get_status)
}

pub fn initialize(store: &SkillStore) -> Result<()> {
    run(store, "backup init", |root| {
        if root.join(".git").exists() {
            commit_if_dirty(root, "Use portable Skills backup layout")
        } else {
            git_backup::init_repo_unlocked(root, &git_backup::default_device_name())
        }
    })
}

pub fn commit(store: &SkillStore, message: &str) -> Result<String> {
    run(store, "backup commit", |root| {
        commit_if_dirty(root, message)?;
        git_backup::create_snapshot_tag_unlocked(root)
    })
}

pub fn pull(store: &SkillStore) -> Result<super::merge::MergeSummary> {
    run(store, "backup pull", |root| {
        super::merge::gated_pull_unlocked(store, root)
    })
}

pub fn restore(store: &SkillStore, tag: &str) -> Result<String> {
    run(store, "backup restore", |root| {
        commit_if_dirty(root, "backup before restore")?;
        git_backup::restore_snapshot_version_unlocked(root, tag)
    })
}

fn commit_if_dirty(root: &Path, message: &str) -> Result<()> {
    if git_backup::has_uncommitted_changes(root)? {
        git_backup::commit_all_unlocked(root, message)?;
    }
    Ok(())
}

pub fn clone_repo(store: &SkillStore, url: &str, strict: bool) -> Result<()> {
    git_backup::with_repo_lock("backup clone", || {
        if strict
            && files::names(&central_repo::skills_dir())?
                .iter()
                .any(|name| files::content_name(name))
        {
            bail!("Explicit Skills directory must be empty before cloning");
        }
        run_unlocked(store, |root| clone_unlocked(root, url))
    })
}

pub(crate) fn recover_on_startup(store: &SkillStore) {
    if journal_path().exists() {
        if let Err(error) = git_backup::with_repo_lock("backup recovery", || finish_unlocked(store))
        {
            log::warn!("backup publication recovery: {error:#}");
        }
    }
}

/// Clone first; normalize legacy layout before carrying local-only Skills.
/// The previous repository and its complete history remain in recovery.
pub(crate) fn clone_unlocked(root: &Path, url: &str) -> Result<()> {
    let stage = tempfile::tempdir_in(central_repo::base_dir())?;
    let checkout = stage.path().join("checkout");
    git_backup::clone_into_unlocked(&checkout, url)?;
    normalize_layout(&checkout)?;
    carry_local_only(&root.join("skills"), &checkout.join("skills"))?;
    // Restore does not discard tags/IDs of Skills present only on this device.
    let remote_meta = read_metadata(&checkout.join(".agent-hub/skills"))?;
    for (path, meta) in read_metadata(&root.join(".agent-hub/skills"))? {
        validate_relative(&meta.path)?;
        if checkout.join(&meta.path).is_dir()
            && !remote_meta.iter().any(|(_, other)| {
                other.skill_id == meta.skill_id || other.path_key == meta.path_key
            })
        {
            let target = checkout
                .join(".agent-hub/skills")
                .join(path.file_name().context("Metadata file has no name")?);
            fs::create_dir_all(target.parent().context("Metadata has no parent")?)?;
            fs::copy(path, target)?;
        }
    }
    let recovery = central_repo::base_dir()
        .join("recovery")
        .join(format!("repository-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(recovery.parent().context("Recovery has no parent")?)?;
    fs::rename(root, &recovery)?;
    if let Err(error) = fs::rename(&checkout, root) {
        fs::rename(recovery, root)?;
        return Err(error.into());
    }
    Ok(())
}

fn carry_local_only(source: &Path, target: &Path) -> Result<()> {
    for name in files::names(source)? {
        let from = source.join(&name);
        let to = target.join(name);
        if to
            .symlink_metadata()
            .is_err_and(|error| error.kind() == std::io::ErrorKind::NotFound)
        {
            files::copy(&from, &to, false)?;
        } else if from.is_dir()
            && to.is_dir()
            && !to.is_symlink()
            && !from.join("SKILL.md").is_file()
            && !to.join("SKILL.md").is_file()
        {
            carry_local_only(&from, &to)?;
        }
    }
    Ok(())
}

fn ensure_repo() -> Result<()> {
    let root = repo_dir();
    let live = central_repo::skills_dir();
    if root.starts_with(&live) || live.starts_with(&root) {
        bail!("Backup and live Skills directories must be independent");
    }
    if root.is_symlink() {
        bail!("Backup directory must not be a symbolic link");
    }
    if live.join(".agent-hub").is_symlink() {
        bail!("Skills metadata directory must not be a symbolic link");
    }
    if !root.exists() && live.join(".git").exists() {
        if !live.join(".git").is_dir() || live.join(".git").is_symlink() {
            bail!("Linked Git worktrees require an independent backup repository");
        }
        git_backup::ensure_no_interrupted_git_operation(&live)?;
        let stage = tempfile::tempdir_in(central_repo::base_dir())?;
        let copy = stage.path().join("repo");
        files::copy(&live, &copy, true)?;
        let mut config = git2::Config::open(&copy.join(".git/config"))?;
        if config.get_string("core.worktree").is_ok() {
            config.remove("core.worktree")?;
        }
        // Preserve all Git refs/history/config; the source is retained intact.
        normalize_layout(&copy)?;
        fs::rename(copy, &root)?;
    }
    fs::create_dir_all(&root)?;
    normalize_layout(&root)
}

/// Accept older flat backups and standard skills/ repositories without
/// rewriting history. The next backup commit records the layout transition.
pub(crate) fn normalize_layout(root: &Path) -> Result<()> {
    if root.join(".agent-hub").is_symlink() || root.join("skills").is_symlink() {
        bail!("Linked backup layout is not supported");
    }
    if root.join(LAYOUT).is_file() {
        return Ok(());
    }
    let metadata = root.join(".agent-hub/skills");
    let metas = read_metadata(&metadata)?;
    let nested = root.join("skills").is_dir()
        && !root.join("skills/SKILL.md").is_file()
        && (metas.is_empty()
            || metas
                .iter()
                .all(|(_, meta)| meta.path.starts_with("skills/")));
    if !nested {
        for (_, meta) in &metas {
            validate_relative(&meta.path)?;
        }
        let stage = tempfile::tempdir_in(root.parent().context("Backup has no parent")?)?;
        let content = stage.path().join("skills");
        fs::create_dir(&content)?;
        let names: Vec<_> = files::names(root)?
            .into_iter()
            .filter(|name| files::content_name(name))
            .collect();
        for name in &names {
            files::copy_skill(&root.join(name), &content.join(name))?;
        }
        // Persist originals before replacing layout; an error or crash never
        // drops moved content with a temporary directory.
        let recovery = central_repo::base_dir()
            .join("recovery")
            .join(format!("layout-{}", uuid::Uuid::new_v4()));
        for name in &names {
            fs::create_dir_all(&recovery)?;
            fs::rename(root.join(name), recovery.join(name))?;
        }
        fs::rename(content, root.join("skills"))?;
        for (path, mut meta) in metas {
            validate_relative(&meta.path)?;
            meta.path = format!("skills/{}", meta.path);
            meta.path_key = sync_metadata::path_key(&meta.path);
            fs::write(path, sync_metadata::canonical_json_bytes(&meta)?)?;
        }
    }
    fs::create_dir_all(root.join(".agent-hub"))?;
    fs::write(root.join(LAYOUT), b"{\"version\":1}\n")?;
    if !root.join("README.md").exists() {
        fs::write(root.join("README.md"), README)?;
    }
    Ok(())
}

fn validate_relative(path: &str) -> Result<()> {
    if path.is_empty()
        || path.contains('\\')
        || path.contains(':')
        || Path::new(path)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        bail!("Invalid backup Skill path");
    }
    Ok(())
}

fn read_metadata(root: &Path) -> Result<Vec<(PathBuf, sync_metadata::SkillMetaFile)>> {
    let mut result = Vec::new();
    for name in files::names(root)? {
        if name.ends_with(".json") {
            let path = root.join(name);
            result.push((path.clone(), serde_json::from_slice(&fs::read(path)?)?));
        }
    }
    Ok(result)
}

pub(crate) fn prepare_unlocked(store: &SkillStore) -> Result<()> {
    fs::create_dir_all(central_repo::base_dir())?;
    if journal_path().exists() {
        finish_unlocked(store)?;
    }
    ensure_repo()?;
    let root = repo_dir();
    if root.join(".git").exists() {
        git_backup::ensure_no_interrupted_git_operation(&root)?;
    }
    super::shared_skill_index::register_missing(store)?;
    sync_metadata::write_all_from_db_unlocked(store)?;
    let live = central_repo::skills_dir();
    let before = files::snapshot(&live)?;
    if before != files::snapshot(&root.join("skills"))? {
        let stage = tempfile::tempdir_in(&root)?;
        let content = stage.path().join("skills");
        fs::create_dir(&content)?;
        for name in before.keys() {
            files::copy_skill(&live.join(name), &content.join(name))?;
        }
        if before != files::snapshot(&live)? || before != files::snapshot(&content)? {
            bail!("Skills changed during backup; retry sync");
        }
        files::remove(&root.join("skills"))?;
        fs::rename(content, root.join("skills"))?;
    }
    if before != files::snapshot(&live)? {
        bail!("Skills changed during backup; retry sync");
    }
    project_metadata(&live.join(".agent-hub"), &root.join(".agent-hub"), true)?;
    fs::write(root.join(LAYOUT), b"{\"version\":1}\n")?;
    let journal = Journal {
        live_root: live,
        before,
        recovery: central_repo::base_dir()
            .join("recovery")
            .join(format!("backup-{}", uuid::Uuid::new_v4())),
    };
    let journal_tmp = central_repo::base_dir().join("backup-publication.tmp");
    fs::write(&journal_tmp, serde_json::to_vec(&journal)?)?;
    fs::rename(journal_tmp, journal_path())?;
    Ok(())
}

fn project_metadata(source: &Path, target: &Path, exporting: bool) -> Result<()> {
    // Only portable schema/records, never sync protocol files or local state.
    for name in ["schema.json", "skills", "scenarios", "scenario-skills"] {
        files::remove(&target.join(name))?;
        if source.join(name).exists() {
            files::copy(&source.join(name), &target.join(name), false)?;
        }
    }
    for (path, mut meta) in read_metadata(&target.join("skills"))? {
        validate_relative(&meta.path)?;
        meta.path = if exporting {
            format!("skills/{}", meta.path)
        } else {
            meta.path
                .strip_prefix("skills/")
                .context("Backup Skill is outside skills/")?
                .to_string()
        };
        validate_relative(&meta.path)?;
        meta.path_key = sync_metadata::path_key(&meta.path);
        fs::write(path, sync_metadata::canonical_json_bytes(&meta)?)?;
    }
    Ok(())
}

/// Replayable publication: changed originals remain in recovery. Concurrent
/// external edits stop publication instead of being replaced by remote data.
pub(crate) fn finish_unlocked(store: &SkillStore) -> Result<()> {
    if !journal_path().exists() {
        return Ok(());
    }
    let journal: Journal = serde_json::from_slice(&fs::read(journal_path())?)?;
    let root = repo_dir();
    if journal.live_root != central_repo::skills_dir() {
        bail!("Pending backup belongs to another Skills directory");
    }
    if root.join(".git").exists() {
        git_backup::ensure_no_interrupted_git_operation(&root)?;
    }
    normalize_layout(&root)?;
    let desired = files::snapshot(&root.join("skills"))?;
    let names: BTreeSet<_> = journal.before.keys().chain(desired.keys()).collect();
    let changed: Vec<_> = names
        .into_iter()
        .filter(|name| journal.before.get(*name) != desired.get(*name))
        .collect();
    // Validate the entire restore before moving any live entry, including
    // symlinks from untrusted remotes and metadata traversal.
    let stage = tempfile::tempdir_in(
        journal
            .live_root
            .parent()
            .context("Skills directory has no parent")?,
    )?;
    project_metadata(
        &root.join(".agent-hub"),
        &stage.path().join(".agent-hub"),
        false,
    )?;
    let metadata_changed = ["schema.json", "skills", "scenarios", "scenario-skills"]
        .iter()
        .try_fold(false, |changed, name| -> Result<bool> {
            Ok(changed
                || files::fingerprint(&stage.path().join(".agent-hub").join(name))?
                    != files::fingerprint(&journal.live_root.join(".agent-hub").join(name))?)
        })?;
    if changed.is_empty() && !metadata_changed {
        fs::remove_file(journal_path())?;
        return Ok(());
    }
    for name in &changed {
        let current = files::fingerprint(&journal.live_root.join(name))?;
        let original_saved = journal.recovery.join(name).symlink_metadata().is_ok();
        if current.as_ref() != journal.before.get(*name)
            && current.as_ref() != desired.get(*name)
            && !(current.is_none() && original_saved)
        {
            bail!("Skills changed while syncing; backup result retained for recovery, retry after preserving local edits");
        }
        if desired.contains_key(*name) {
            files::copy(
                &root.join("skills").join(name),
                &stage.path().join(name),
                false,
            )?;
        }
    }
    for name in changed {
        let target = journal.live_root.join(name);
        let current = files::fingerprint(&target)?;
        if current.as_ref() == desired.get(name) {
            continue;
        }
        if current.as_ref() != journal.before.get(name)
            && !(current.is_none() && journal.recovery.join(name).symlink_metadata().is_ok())
        {
            bail!("Skills changed during restore; originals and backup retained");
        }
        fs::create_dir_all(&journal.recovery)?;
        if target.symlink_metadata().is_ok() {
            if journal.recovery.join(name).symlink_metadata().is_ok() {
                bail!("Recovery entry already exists; live Skills preserved");
            }
            fs::rename(&target, journal.recovery.join(name))?;
        }
        if desired.contains_key(name) {
            if target.symlink_metadata().is_ok() {
                bail!("Skills recreated during restore; originals retained");
            }
            fs::rename(stage.path().join(name), &target)?;
        }
    }
    for name in ["schema.json", "skills", "scenarios", "scenario-skills"] {
        let target = journal.live_root.join(".agent-hub").join(name);
        files::remove(&target)?;
        let source = stage.path().join(".agent-hub").join(name);
        if source.exists() {
            files::copy(&source, &target, false)?;
        }
    }
    crate::commands::git_backup::reconcile_skills_index_unlocked(store)?;
    fs::remove_file(journal_path())?;
    Ok(())
}

/// Legacy low-level callers still project metadata themselves. A separated
/// worktree has already been projected by its enclosing transaction.
pub(crate) fn write_metadata(store: &SkillStore, root: &Path) -> Result<()> {
    if root == repo_dir() {
        Ok(())
    } else {
        sync_metadata::write_all_from_db_unlocked(store)
    }
}

pub(crate) fn reconcile(store: &SkillStore, root: &Path) -> Result<()> {
    if root == repo_dir() {
        Ok(())
    } else {
        crate::commands::git_backup::reconcile_skills_index_unlocked(store)
    }
}
