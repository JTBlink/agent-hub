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
mod tests;
