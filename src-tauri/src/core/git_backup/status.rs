//! Backup status and the file changes still waiting to be backed up.
use super::*;
use std::collections::BTreeSet;

#[derive(Debug, Clone, serde::Serialize)]
pub struct GitBackupStatus {
    /// Whether the skills directory is a git repository
    pub is_repo: bool,
    /// The configured remote URL (if any)
    pub remote_url: Option<String>,
    /// Current branch name
    pub branch: Option<String>,
    /// Whether there are uncommitted changes
    pub has_changes: bool,
    /// Number of distinct skill directories with changes pending backup.
    /// Drives the "N skills have unbacked changes" status copy; 0 when only
    /// metadata or root files changed.
    pub changed_skill_count: u32,
    /// File changes, including local commits not yet pushed to the upstream.
    pub changes: Vec<GitBackupChange>,
    /// Number of commits ahead of remote
    pub ahead: u32,
    /// Number of commits behind remote
    pub behind: u32,
    /// Last commit message
    pub last_commit: Option<String>,
    /// Last commit timestamp (ISO 8601)
    pub last_commit_time: Option<String>,
    /// Snapshot tag that points at current HEAD (if any)
    pub current_snapshot_tag: Option<String>,
    /// Snapshot tag restored most recently (when HEAD is a restore commit)
    pub restored_from_tag: Option<String>,
    /// Health of the relationship to the configured remote.
    /// One of: "healthy", "no_remote", "no_upstream", "unrelated_histories", "detached".
    pub upstream_health: String,
}

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackupChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
    Conflicted,
}

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
pub struct GitBackupChange {
    /// Repository-relative path, never an absolute local path.
    pub path: String,
    pub previous_path: Option<String>,
    pub kind: BackupChangeKind,
}

/// Get the current git status of the skills directory.
pub fn get_status(skills_dir: &Path) -> Result<GitBackupStatus> {
    if !skills_dir.join(".git").exists() {
        return Ok(GitBackupStatus {
            is_repo: false,
            remote_url: None,
            branch: None,
            has_changes: false,
            changed_skill_count: 0,
            changes: Vec::new(),
            ahead: 0,
            behind: 0,
            last_commit: None,
            last_commit_time: None,
            current_snapshot_tag: None,
            restored_from_tag: None,
            upstream_health: "no_remote".to_string(),
        });
    }

    let remote_url = run_git(skills_dir, &["remote", "get-url", "origin"])
        .ok()
        .map(|url| redact_url(&url));

    let branch = run_git(skills_dir, &["rev-parse", "--abbrev-ref", "HEAD"]).ok();

    let repo = git2::Repository::open(skills_dir).context("Cannot read backup repository")?;
    let has_changes = !repo.statuses(None)?.is_empty();

    let (ahead, behind) = get_ahead_behind(skills_dir).unwrap_or((0, 0));

    let last_commit = run_git(skills_dir, &["log", "-1", "--format=%s"]).ok();

    let last_commit_time = run_git(skills_dir, &["log", "-1", "--format=%cI"]).ok();

    let current_snapshot_tag = run_git(
        skills_dir,
        &[
            "tag",
            "--points-at",
            "HEAD",
            "--list",
            "sm-v-*",
            "--sort=-creatordate",
        ],
    )
    .ok()
    .and_then(|output| {
        output
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(|line| line.to_string())
    });

    let restored_from_tag = last_commit
        .as_deref()
        .and_then(parse_restored_from_tag_message);

    let upstream_health = detect_upstream_health(skills_dir, remote_url.is_some());

    let changes = pending_changes(&repo, ahead, &upstream_health)?;
    let changed_skill_count = count_changed_skills(&changes);

    Ok(GitBackupStatus {
        is_repo: true,
        remote_url,
        branch,
        has_changes,
        changed_skill_count,
        changes,
        ahead,
        behind,
        last_commit,
        last_commit_time,
        current_snapshot_tag,
        restored_from_tag,
        upstream_health,
    })
}

/// Compare with HEAD for working changes, or the common ancestor for unpushed
/// commits. Using the ancestor avoids listing remote-only updates as local edits.
fn pending_changes(
    repo: &git2::Repository,
    ahead: u32,
    upstream_health: &str,
) -> Result<Vec<GitBackupChange>> {
    let head = match repo.head() {
        Ok(head) => Some(head.peel_to_commit()?),
        Err(error)
            if matches!(
                error.code(),
                git2::ErrorCode::UnbornBranch | git2::ErrorCode::NotFound
            ) =>
        {
            None
        }
        Err(error) => return Err(error.into()),
    };
    let baseline = if upstream_health == "no_upstream" {
        None // A first upload must include all existing files.
    } else if ahead > 0 {
        let head = head.as_ref().context("Backup HEAD is missing")?;
        let upstream = repo.revparse_single("@{upstream}")?.peel_to_commit()?;
        Some(
            repo.find_commit(repo.merge_base(head.id(), upstream.id())?)?
                .tree()?,
        )
    } else {
        head.map(|head| head.tree()).transpose()?
    };
    let mut options = git2::DiffOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_typechange(true);
    let mut diff = repo.diff_tree_to_workdir_with_index(baseline.as_ref(), Some(&mut options))?;
    diff.find_similar(Some(git2::DiffFindOptions::new().renames(true)))?;
    let mut changes = Vec::new();
    for delta in diff.deltas() {
        let kind = match delta.status() {
            git2::Delta::Added | git2::Delta::Untracked => BackupChangeKind::Added,
            git2::Delta::Deleted => BackupChangeKind::Deleted,
            git2::Delta::Renamed => BackupChangeKind::Renamed,
            git2::Delta::Conflicted => BackupChangeKind::Conflicted,
            git2::Delta::Modified | git2::Delta::Typechange | git2::Delta::Copied => {
                BackupChangeKind::Modified
            }
            _ => continue,
        };
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .context("Backup change has no path")?
            .to_string_lossy()
            .into_owned();
        let previous_path = if kind == BackupChangeKind::Renamed {
            delta
                .old_file()
                .path()
                .map(|path| path.to_string_lossy().into_owned())
        } else {
            None
        };
        changes.push(GitBackupChange {
            path,
            previous_path,
            kind,
        });
    }
    changes.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(changes)
}

fn count_changed_skills(changes: &[GitBackupChange]) -> u32 {
    changes
        .iter()
        .flat_map(|change| {
            std::iter::once(change.path.as_str()).chain(change.previous_path.as_deref())
        })
        .filter_map(|path| {
            let path = path.strip_prefix("skills/").unwrap_or(path);
            let (name, _) = path.split_once('/')?;
            (!name.starts_with('.')).then_some(name)
        })
        .collect::<BTreeSet<_>>()
        .len() as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write(root: &Path, path: &str, content: &str) {
        let path = root.join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn commit(repo: &git2::Repository) -> git2::Oid {
        let mut index = repo.index().unwrap();
        index
            .add_all(["*"], git2::IndexAddOption::DEFAULT, None)
            .unwrap();
        index.update_all(["*"], None).unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let signature = git2::Signature::now("Test Device", "user@example.invalid").unwrap();
        let parent = repo.head().ok().map(|head| head.peel_to_commit().unwrap());
        let parents: Vec<_> = parent.iter().collect();
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            "test backup",
            &tree,
            &parents,
        )
        .unwrap()
    }

    fn baseline(repo: &git2::Repository) {
        let commit = repo.head().unwrap().peel_to_commit().unwrap();
        repo.branch("baseline", &commit, false).unwrap();
        let branch = repo.head().unwrap().shorthand().unwrap().to_string();
        repo.find_branch(&branch, git2::BranchType::Local)
            .unwrap()
            .set_upstream(Some("baseline"))
            .unwrap();
    }

    #[test]
    fn status_lists_staged_unstaged_deleted_and_nested_untracked_files() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let repo = git2::Repository::init(root).unwrap();
        for path in [
            "skills/demo/SKILL.md",
            "skills/old/SKILL.md",
            ".agent-hub/state.json",
        ] {
            write(root, path, "original");
        }
        write(root, ".gitignore", "ignored/\n");
        commit(&repo);
        baseline(&repo);
        write(root, "skills/demo/SKILL.md", "updated content");
        write(root, ".agent-hub/state.json", "updated metadata");
        fs::remove_file(root.join("skills/old/SKILL.md")).unwrap();
        write(root, "skills/新 技能/notes/说明.md", "new file");
        write(root, "skills/staged/SKILL.md", "staged file");
        write(root, "ignored/secret.txt", "ignored file");
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("skills/staged/SKILL.md")).unwrap();
        index.write().unwrap();

        let status = get_status(root).unwrap();
        assert!(status.has_changes);
        assert_eq!(status.changed_skill_count, 4);
        let entries: Vec<_> = status
            .changes
            .iter()
            .map(|change| (change.path.as_str(), &change.kind))
            .collect();
        assert_eq!(
            entries,
            vec![
                (".agent-hub/state.json", &BackupChangeKind::Modified),
                ("skills/demo/SKILL.md", &BackupChangeKind::Modified),
                ("skills/old/SKILL.md", &BackupChangeKind::Deleted),
                ("skills/staged/SKILL.md", &BackupChangeKind::Added),
                ("skills/新 技能/notes/说明.md", &BackupChangeKind::Added),
            ]
        );
        assert_eq!(
            fs::read_to_string(root.join("skills/demo/SKILL.md")).unwrap(),
            "updated content"
        );
    }

    #[test]
    fn status_includes_unpushed_commits_and_clears_after_upstream_catches_up() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let repo = git2::Repository::init(root).unwrap();
        write(root, "skills/demo/SKILL.md", "original");
        commit(&repo);
        baseline(&repo);
        write(root, "skills/demo/SKILL.md", "committed changes");
        let head = commit(&repo);

        let status = get_status(root).unwrap();
        assert!(!status.has_changes);
        assert_eq!(status.ahead, 1);
        assert_eq!(status.changed_skill_count, 1);
        assert_eq!(status.changes[0].path, "skills/demo/SKILL.md");
        repo.find_reference("refs/heads/baseline")
            .unwrap()
            .set_target(head, "uploaded")
            .unwrap();
        assert!(get_status(root).unwrap().changes.is_empty());
    }

    #[test]
    fn remote_only_and_divergent_updates_are_not_listed_as_local_changes() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let repo = git2::Repository::init(root).unwrap();
        write(root, "skills/demo/SKILL.md", "original");
        commit(&repo);
        baseline(&repo);
        let branch = repo.head().unwrap().name().unwrap().to_string();
        repo.set_head("refs/heads/baseline").unwrap();
        write(root, "skills/remote/SKILL.md", "remote change");
        commit(&repo);
        repo.set_head(&branch).unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();
        assert!(get_status(root).unwrap().changes.is_empty());
        write(root, "skills/local/SKILL.md", "local change");
        commit(&repo);
        let status = get_status(root).unwrap();
        assert_eq!((status.ahead, status.behind), (1, 1));
        assert_eq!(status.changes.len(), 1);
        assert_eq!(status.changes[0].path, "skills/local/SKILL.md");
    }

    #[test]
    fn first_upload_lists_existing_files_and_staged_rename_preserves_both_paths() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let repo = git2::Repository::init(root).unwrap();
        write(root, "skills/old/SKILL.md", "original");
        commit(&repo);
        // A configured remote with no upstream has never received this backup.
        repo.remote("origin", "https://example.invalid/backup.git")
            .unwrap();
        let status = get_status(root).unwrap();
        assert_eq!(status.upstream_health, "no_upstream");
        assert_eq!(status.changes[0].kind, BackupChangeKind::Added);
        baseline(&repo);
        fs::create_dir_all(root.join("skills/new")).unwrap();
        fs::rename(
            root.join("skills/old/SKILL.md"),
            root.join("skills/new/SKILL.md"),
        )
        .unwrap();
        let mut index = repo.index().unwrap();
        index.remove_path(Path::new("skills/old/SKILL.md")).unwrap();
        index.add_path(Path::new("skills/new/SKILL.md")).unwrap();
        index.write().unwrap();
        let status = get_status(root).unwrap();
        assert_eq!(
            status.changes,
            vec![GitBackupChange {
                path: "skills/new/SKILL.md".into(),
                previous_path: Some("skills/old/SKILL.md".into()),
                kind: BackupChangeKind::Renamed,
            }]
        );
        assert_eq!(status.changed_skill_count, 2);
    }

    #[test]
    fn skill_count_excludes_metadata_and_root_files_and_supports_legacy_layout() {
        let changes = [
            "README.md",
            ".gitignore",
            ".agent-hub/skills/demo.json",
            "skills/demo/SKILL.md",
            "skills/demo/notes.md",
            "legacy/SKILL.md",
        ]
        .into_iter()
        .map(|path| GitBackupChange {
            path: path.into(),
            previous_path: None,
            kind: BackupChangeKind::Modified,
        })
        .collect::<Vec<_>>();
        assert_eq!(count_changed_skills(&changes), 2);
    }
}
