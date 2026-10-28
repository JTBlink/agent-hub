//! Restorable history includes automatic Git commits and explicit snapshots.
use super::*;
use std::collections::HashMap;

fn version(commit: &git2::Commit<'_>, reference: String) -> Result<GitBackupVersion> {
    let time = commit.time();
    let offset = chrono::FixedOffset::east_opt(time.offset_minutes() * 60)
        .context("Invalid backup commit timezone")?;
    let date = chrono::DateTime::from_timestamp(time.seconds(), 0)
        .context("Invalid backup commit timestamp")?
        .with_timezone(&offset);
    Ok(GitBackupVersion {
        tag: reference,
        commit: commit.id().to_string()[..8].into(),
        message: commit.summary().unwrap_or_default().into(),
        committed_at: date.to_rfc3339_opts(chrono::SecondsFormat::Secs, false),
        author: commit.author().name().unwrap_or_default().into(),
    })
}

pub fn list_snapshot_versions(root: &Path, limit: Option<usize>) -> Result<Vec<GitBackupVersion>> {
    ensure_repo(root)?;
    let max = limit.unwrap_or(30);
    if max == 0 {
        return Ok(Vec::new());
    }
    let repo = git2::Repository::open(root)?;
    let mut versions = HashMap::new();
    // Keep snapshots even when their original branch is no longer on HEAD.
    // Prefer one explicit snapshot over a duplicate plain commit entry.
    for reference in repo.references_glob("refs/tags/sm-v-*")? {
        let reference = reference?;
        let Some(name) = reference.shorthand() else {
            continue;
        };
        let Ok(commit) = reference.peel_to_commit() else {
            continue;
        };
        let when = name
            .get(5..20)
            .and_then(|value| chrono::NaiveDateTime::parse_from_str(value, "%Y%m%d-%H%M%S").ok())
            .map_or(commit.time().seconds(), |date| date.and_utc().timestamp());
        let item = version(&commit, name.into())?;
        let existing = versions
            .entry(commit.id())
            .or_insert((when, usize::MAX, item.clone()));
        if (when, &item.tag) > (existing.0, &existing.2.tag) {
            *existing = (when, usize::MAX, item);
        }
    }
    let mut walk = repo.revwalk()?;
    walk.set_sorting(git2::Sort::TIME)?;
    match walk.push_head() {
        Ok(()) => {
            for (rank, oid) in walk.take(max).enumerate() {
                let commit = repo.find_commit(oid?)?;
                match versions.entry(commit.id()) {
                    std::collections::hash_map::Entry::Vacant(entry) => {
                        entry.insert((
                            commit.time().seconds(),
                            rank,
                            version(&commit, commit.id().to_string())?,
                        ));
                    }
                    std::collections::hash_map::Entry::Occupied(mut entry) => {
                        entry.get_mut().1 = rank
                    }
                }
            }
        }
        Err(error)
            if matches!(
                error.code(),
                git2::ErrorCode::UnbornBranch | git2::ErrorCode::NotFound
            ) => {}
        Err(error) => return Err(error.into()),
    }
    let mut versions: Vec<_> = versions.into_values().collect();
    versions.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| a.1.cmp(&b.1))
            .then_with(|| b.2.tag.cmp(&a.2.tag))
    });
    Ok(versions
        .into_iter()
        .take(max)
        .map(|(_, _, version)| version)
        .collect())
}

pub(super) fn is_commit_reference(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// Resolve before any safety commit or tree mutation. Plain commits must be
/// reachable from HEAD; arbitrary dangling objects and revision expressions
/// are never accepted as restore targets.
pub(super) fn restore_target(root: &Path, reference: &str) -> Result<String> {
    let repo = git2::Repository::open(root)?;
    if reference.starts_with("sm-v-") {
        return Ok(repo
            .find_reference(&format!("refs/tags/{reference}"))?
            .peel_to_commit()?
            .id()
            .to_string());
    }
    if !is_commit_reference(reference) {
        anyhow::bail!("Invalid backup version: expected a snapshot tag or full commit ID");
    }
    let commit = repo.find_commit(git2::Oid::from_str(reference)?)?;
    let head = repo.head()?.peel_to_commit()?.id();
    if head != commit.id() && !repo.graph_descendant_of(head, commit.id())? {
        anyhow::bail!("Backup commit is not part of the current history");
    }
    Ok(commit.id().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn commit(
        repo: &git2::Repository,
        text: &str,
        seconds: i64,
        parent: Option<git2::Oid>,
        head: bool,
    ) -> git2::Oid {
        let root = repo.workdir().unwrap();
        std::fs::write(root.join("note.md"), text).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("note.md")).unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let signature = git2::Signature::new(
            "Device A",
            "user@example.invalid",
            &git2::Time::new(seconds, 480),
        )
        .unwrap();
        let parent = parent.map(|id| repo.find_commit(id).unwrap());
        let parents: Vec<_> = parent.iter().collect();
        repo.commit(
            if head { Some("HEAD") } else { None },
            &signature,
            &signature,
            text,
            &tree,
            &parents,
        )
        .unwrap()
    }
    fn fixture() -> (tempfile::TempDir, git2::Repository, git2::Oid, git2::Oid) {
        let temp = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(temp.path()).unwrap();
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Device A").unwrap();
        config
            .set_str("user.email", "user@example.invalid")
            .unwrap();
        let first = commit(&repo, "first", 1_790_000_000, None, true);
        let second = commit(
            &repo,
            "recent auto backup",
            1_790_000_060,
            Some(first),
            true,
        );
        (temp, repo, first, second)
    }
    #[test]
    fn lists_recent_untagged_backups_and_deduplicates_explicit_snapshots() {
        let (temp, repo, first, second) = fixture();
        let tag = "sm-v-20200101-000000-first";
        repo.tag_lightweight(tag, repo.find_commit(first).unwrap().as_object(), false)
            .unwrap();
        let versions = list_snapshot_versions(temp.path(), Some(50)).unwrap();
        assert_eq!(versions.len(), 2);
        assert_eq!(versions[0].tag, second.to_string());
        assert_eq!(versions[1].tag, tag);
        assert_eq!(versions[0].author, "Device A");
        assert!(versions[0].committed_at.ends_with("+08:00"));
        assert_eq!(
            list_snapshot_versions(temp.path(), Some(1)).unwrap().len(),
            1
        );
        assert!(list_snapshot_versions(temp.path(), Some(0))
            .unwrap()
            .is_empty());
    }
    #[test]
    fn same_second_commits_keep_the_head_first() {
        let (temp, repo, _, second) = fixture();
        let head = commit(&repo, "same second", 1_790_000_060, Some(second), true);
        assert_eq!(
            list_snapshot_versions(temp.path(), Some(1)).unwrap()[0].tag,
            head.to_string()
        );
    }
    #[test]
    fn restores_a_commit_and_preserves_a_safety_snapshot_for_undo() {
        let (temp, _, first, _) = fixture();
        let safety =
            super::super::restore_snapshot_version_unlocked(temp.path(), &first.to_string())
                .unwrap();
        assert_eq!(
            std::fs::read_to_string(temp.path().join("note.md")).unwrap(),
            "first"
        );
        super::super::restore_snapshot_version_unlocked(temp.path(), &safety).unwrap();
        assert_eq!(
            std::fs::read_to_string(temp.path().join("note.md")).unwrap(),
            "recent auto backup"
        );
    }
    #[test]
    fn rejects_dangling_commits_and_revision_expressions_before_any_mutation() {
        let (temp, repo, _, head) = fixture();
        let dangling = commit(&repo, "unrelated object", 1_790_000_120, None, false);
        std::fs::write(temp.path().join("note.md"), "unsaved edit").unwrap();
        let before = super::super::run_git(temp.path(), &["status", "--porcelain"]).unwrap();
        for reference in [
            dangling.to_string(),
            "HEAD~1".into(),
            head.to_string()[..8].into(),
            "--help".into(),
        ] {
            assert!(
                super::super::restore_snapshot_version_unlocked(temp.path(), &reference).is_err(),
                "{reference}"
            );
        }
        assert_eq!(repo.head().unwrap().target(), Some(head));
        assert_eq!(
            super::super::run_git(temp.path(), &["status", "--porcelain"]).unwrap(),
            before
        );
        assert_eq!(
            std::fs::read_to_string(temp.path().join("note.md")).unwrap(),
            "unsaved edit"
        );
        assert!(list_snapshot_versions(temp.path(), None)
            .unwrap()
            .iter()
            .all(|v| v.tag != dangling.to_string()));
    }
    #[test]
    fn retains_snapshots_outside_the_current_branch_without_listing_unrelated_commits() {
        let (temp, repo, _, _) = fixture();
        let orphan = commit(&repo, "archived branch", 1_790_000_120, None, false);
        let tag = "sm-v-20200101-000001-archived";
        repo.tag_lightweight(tag, repo.find_commit(orphan).unwrap().as_object(), false)
            .unwrap();
        assert!(list_snapshot_versions(temp.path(), None)
            .unwrap()
            .iter()
            .any(|v| v.tag == tag));
        assert_eq!(
            restore_target(temp.path(), tag).unwrap(),
            orphan.to_string()
        );
        assert!(restore_target(temp.path(), &orphan.to_string()).is_err());
    }
}
