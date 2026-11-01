//! Explicit index changes and commits. Git CLI preserves hooks and signing configuration.
use anyhow::{bail, Context, Result};
use std::path::Path;
use std::process::Command;

pub(super) fn repository(root: &Path) -> Result<git2::Repository> {
    Ok(git2::Repository::open_ext(
        root,
        git2::RepositoryOpenFlags::NO_SEARCH,
        &[] as &[&Path],
    )?)
}

pub(super) fn run_git(root: &Path, args: &[&str]) -> Result<()> {
    let mut command = Command::new("git");
    command
        .arg("--literal-pathspecs")
        .arg("-C")
        .arg(root)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0");
    // The authorized checkout, rather than a launching shell's overrides, owns the operation.
    for name in [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_COMMON_DIR",
    ] {
        command.env_remove(name);
    }
    super::super::cli_process::capture_prepared(command, "git", 120, None)
        .map_err(anyhow::Error::msg)
        .context("Unable to complete Git operation")?;
    Ok(())
}

/// Update only the explicitly selected paths; unstaging never changes working files.
pub fn set_staged(root: &Path, paths: &[String], staged: bool) -> Result<()> {
    if paths.is_empty() || paths.len() > 2000 {
        bail!("Select between 1 and 2000 files");
    }
    for path in paths {
        super::validate_file_path(path)?;
    }
    let repo = repository(root)?;
    let mut selected = paths.to_vec();
    // A staged rename has both a removal and an addition. Reset both sides together.
    if !staged {
        let mut options = git2::StatusOptions::new();
        options.renames_head_to_index(true);
        for entry in repo.statuses(Some(&mut options))?.iter() {
            if let Some(delta) = entry.head_to_index() {
                let old = delta.old_file().path().and_then(Path::to_str);
                let new = delta.new_file().path().and_then(Path::to_str);
                if old
                    .into_iter()
                    .chain(new)
                    .any(|path| paths.iter().any(|item| item == path))
                {
                    for path in old.into_iter().chain(new) {
                        super::validate_file_path(path)?;
                        if !selected.iter().any(|item| item == path) {
                            selected.push(path.to_string());
                        }
                    }
                }
            }
        }
    }
    let mut args = if staged {
        vec!["add", "-A", "--"]
    } else if repo.head().is_ok() {
        vec!["reset", "-q", "HEAD", "--"]
    } else {
        vec!["rm", "--cached", "-r", "--ignore-unmatch", "--"]
    };
    args.extend(selected.iter().map(String::as_str));
    run_git(root, &args)
}

/// Restore selected working files from the index, leaving staged content untouched.
/// Untracked files are removed only when explicitly selected; directories are never swept.
pub fn discard(root: &Path, paths: &[String]) -> Result<()> {
    if paths.is_empty() || paths.len() > 2000 {
        bail!("Select between 1 and 2000 files");
    }
    let repo = repository(root)?;
    let index = repo.index()?;
    if index.has_conflicts() {
        bail!("Resolve index conflicts before discarding changes");
    }
    let mut tracked = Vec::new();
    let mut untracked = Vec::new();
    for path in paths {
        super::validate_file_path(path)?;
        if index.get_path(Path::new(path), 0).is_some() {
            tracked.push(path.as_str());
        } else {
            let status = repo.status_file(Path::new(path))?;
            if !status.is_wt_new() {
                bail!("Selected path is not an untracked file: {path}");
            }
            let metadata = std::fs::symlink_metadata(root.join(path))?;
            if metadata.is_dir() {
                bail!("Select individual files rather than directories: {path}");
            }
            untracked.push(path.as_str());
        }
    }
    if !tracked.is_empty() {
        let mut args = vec!["restore", "--worktree", "--"];
        args.extend(tracked);
        run_git(root, &args)?;
    }
    if !untracked.is_empty() {
        let mut args = vec!["clean", "-f", "--"];
        args.extend(untracked);
        run_git(root, &args)?;
    }
    Ok(())
}

/// Commit the index only, using the repository's configured identity, hooks and signing.
pub fn commit(root: &Path, message: &str) -> Result<()> {
    if message.trim().is_empty() || message.len() > 64 * 1024 || message.contains('\0') {
        bail!("Enter a commit message of at most 64 KiB");
    }
    let repo = repository(root)?;
    if repo.state() != git2::RepositoryState::Clean || repo.index()?.has_conflicts() {
        bail!("Resolve the current repository operation and conflicts before committing");
    }
    run_git(root, &["commit", "-m", message])
}

#[cfg(test)]
mod tests {
    use super::*;
    fn init(root: &Path) -> git2::Repository {
        let repo = git2::Repository::init(root).unwrap();
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Example Developer").unwrap();
        config
            .set_str("user.email", "user@example.invalid")
            .unwrap();
        config.set_bool("commit.gpgsign", false).unwrap();
        config.set_str("core.hooksPath", "disabled-hooks").unwrap();
        repo
    }
    #[test]
    fn discards_only_selected_working_changes_and_preserves_index_and_neighbors() {
        let temp = tempfile::tempdir().unwrap();
        let repo = init(temp.path());
        std::fs::write(temp.path().join("demo.txt"), "original").unwrap();
        std::fs::write(temp.path().join("deleted.txt"), "restore me").unwrap();
        std::fs::write(temp.path().join("neighbor.txt"), "original").unwrap();
        set_staged(
            temp.path(),
            &[
                "demo.txt".into(),
                "deleted.txt".into(),
                "neighbor.txt".into(),
            ],
            true,
        )
        .unwrap();
        commit(temp.path(), "initial").unwrap();
        std::fs::write(temp.path().join("demo.txt"), "staged").unwrap();
        set_staged(temp.path(), &["demo.txt".into()], true).unwrap();
        std::fs::write(temp.path().join("demo.txt"), "unstaged").unwrap();
        std::fs::remove_file(temp.path().join("deleted.txt")).unwrap();
        std::fs::write(temp.path().join("neighbor.txt"), "keep neighbor").unwrap();
        std::fs::write(temp.path().join("new.txt"), "remove me").unwrap();
        std::fs::write(temp.path().join("other.txt"), "keep untracked").unwrap();
        discard(
            temp.path(),
            &["demo.txt".into(), "deleted.txt".into(), "new.txt".into()],
        )
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(temp.path().join("demo.txt")).unwrap(),
            "staged"
        );
        assert_eq!(
            std::fs::read_to_string(temp.path().join("deleted.txt")).unwrap(),
            "restore me"
        );
        assert_eq!(
            std::fs::read_to_string(temp.path().join("neighbor.txt")).unwrap(),
            "keep neighbor"
        );
        assert!(temp.path().join("other.txt").exists());
        assert!(!temp.path().join("new.txt").exists());
        let index = repo.index().unwrap();
        let entry = index.get_path(Path::new("demo.txt"), 0).unwrap();
        assert_eq!(repo.find_blob(entry.id).unwrap().content(), b"staged");
    }

    #[test]
    fn rejects_invalid_discard_batches_before_changing_any_files() {
        let temp = tempfile::tempdir().unwrap();
        init(temp.path());
        std::fs::write(temp.path().join("keep.txt"), "keep").unwrap();
        std::fs::create_dir(temp.path().join("folder")).unwrap();
        std::fs::write(temp.path().join("folder/keep.txt"), "keep").unwrap();
        for invalid in ["../outside", ":(glob)*", "folder", ".git/config"] {
            assert!(discard(temp.path(), &["keep.txt".into(), invalid.into()]).is_err());
            assert!(temp.path().join("keep.txt").exists());
            assert!(temp.path().join("folder/keep.txt").exists());
        }
    }

    #[test]
    fn stages_and_unstages_unborn_files_without_deleting_working_content() {
        let temp = tempfile::tempdir().unwrap();
        let repo = init(temp.path());
        std::fs::write(temp.path().join("demo.txt"), "original\n").unwrap();
        set_staged(temp.path(), &["demo.txt".into()], true).unwrap();
        assert!(repo
            .status_file(Path::new("demo.txt"))
            .unwrap()
            .is_index_new());
        set_staged(temp.path(), &["demo.txt".into()], false).unwrap();
        assert!(repo.status_file(Path::new("demo.txt")).unwrap().is_wt_new());
        assert_eq!(
            std::fs::read_to_string(temp.path().join("demo.txt")).unwrap(),
            "original\n"
        );
    }
    #[test]
    fn commits_only_the_index_and_preserves_unstaged_edits() {
        let temp = tempfile::tempdir().unwrap();
        let repo = init(temp.path());
        std::fs::write(temp.path().join("demo.txt"), "staged\n").unwrap();
        set_staged(temp.path(), &["demo.txt".into()], true).unwrap();
        std::fs::write(temp.path().join("demo.txt"), "working\n").unwrap();
        commit(temp.path(), "Initial content").unwrap();
        let tree = repo.head().unwrap().peel_to_tree().unwrap();
        let entry = tree.get_path(Path::new("demo.txt")).unwrap();
        assert_eq!(repo.find_blob(entry.id()).unwrap().content(), b"staged\n");
        assert!(repo
            .status_file(Path::new("demo.txt"))
            .unwrap()
            .is_wt_modified());
        set_staged(temp.path(), &["demo.txt".into()], true).unwrap();
        set_staged(temp.path(), &["demo.txt".into()], false).unwrap();
        assert!(!repo
            .status_file(Path::new("demo.txt"))
            .unwrap()
            .is_index_modified());
        assert!(commit(temp.path(), "No staged changes").is_err());
    }
    #[test]
    fn unstages_both_sides_of_a_rename_and_preserves_the_renamed_file() {
        let temp = tempfile::tempdir().unwrap();
        let repo = init(temp.path());
        std::fs::write(temp.path().join("old.txt"), "content\n").unwrap();
        set_staged(temp.path(), &["old.txt".into()], true).unwrap();
        commit(temp.path(), "Initial content").unwrap();
        run_git(temp.path(), &["mv", "old.txt", "new.txt"]).unwrap();
        set_staged(temp.path(), &["new.txt".into()], false).unwrap();
        let index = repo.index().unwrap();
        assert!(index.get_path(Path::new("old.txt"), 0).is_some());
        assert!(index.get_path(Path::new("new.txt"), 0).is_none());
        assert_eq!(
            std::fs::read_to_string(temp.path().join("new.txt")).unwrap(),
            "content\n"
        );
    }

    #[test]
    fn rejects_path_traversal_and_treats_git_pathspecs_literally() {
        let temp = tempfile::tempdir().unwrap();
        init(temp.path());
        std::fs::write(temp.path().join("one.txt"), "one").unwrap();
        std::fs::write(temp.path().join("two.txt"), "two").unwrap();
        assert!(set_staged(temp.path(), &["../outside".into()], true).is_err());
        assert!(set_staged(temp.path(), &[":(glob)*".into()], true).is_err());
        assert!(super::super::status(temp.path())
            .unwrap()
            .files
            .iter()
            .all(|file| !file.staged));
        assert!(commit(temp.path(), " ").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn honors_failing_commit_hooks_and_keeps_staged_files() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let repo = init(temp.path());
        let hooks = temp.path().join("disabled-hooks");
        std::fs::create_dir(&hooks).unwrap();
        let hook = hooks.join("pre-commit");
        std::fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
        std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::write(temp.path().join("demo.txt"), "content").unwrap();
        set_staged(temp.path(), &["demo.txt".into()], true).unwrap();
        assert!(commit(temp.path(), "Blocked by hook").is_err());
        assert!(repo.head().is_err());
        assert!(repo
            .status_file(Path::new("demo.txt"))
            .unwrap()
            .is_index_new());
    }
}
