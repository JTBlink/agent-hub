use super::*;

/// Resolve a linked checkout from current Git metadata before any destructive action.
pub fn validate_removal(store: &SkillStore, project_id: &str, path: &str) -> Result<PathBuf> {
    let root = project_paths::project_directory(store, project_id)?;
    let target = directory(store, project_id, Some(path))?;
    let entry = list_directory(&root)?
        .into_iter()
        .find(|entry| Path::new(&entry.path).canonicalize().ok().as_ref() == Some(&target))
        .context("Worktree no longer exists; refresh before retrying")?;
    if entry.is_main || target == root.canonicalize()? {
        bail!("The main or registered project checkout cannot be deleted");
    }
    if entry.locked {
        bail!("Worktree is locked; unlock it before deleting");
    }
    let repo = git2::Repository::open(&target)?;
    let mut options = git2::StatusOptions::new();
    options
        .include_untracked(true)
        .include_ignored(true)
        .recurse_untracked_dirs(true);
    if !repo.statuses(Some(&mut options))?.is_empty() {
        bail!("Worktree contains local or ignored files; commit or move them before deleting");
    }
    Ok(target)
}

/// Remove only an authorized, clean linked checkout; retain its Git branch.
pub fn remove(store: &SkillStore, project_id: &str, path: &str) -> Result<()> {
    let target = validate_removal(store, project_id, path)?;
    let root = project_paths::project_directory(store, project_id)?;
    super::super::project_git::run_git(
        &root,
        &[
            "worktree",
            "remove",
            "--",
            target.to_str().context("Worktree path must be Unicode")?,
        ],
    )?;
    Ok(())
}
