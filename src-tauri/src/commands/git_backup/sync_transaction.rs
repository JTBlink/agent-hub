use super::*;

/// Outcome of a full sync transaction for the frontend.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SyncOutcome {
    /// Local changes were committed as part of this sync.
    pub committed: bool,
    /// Merge result when a merge ran (None when nothing to pull).
    pub merge: Option<merge::MergeSummary>,
    pub pushed: bool,
    /// Snapshot tag on the pushed state (None when nothing was pushed).
    pub snapshot_tag: Option<String>,
}

const SYNC_PUSH_ATTEMPTS: usize = 3;

pub(super) fn run_sync_blocking(
    store: &SkillStore,
    skills_dir: &Path,
    message: &str,
) -> anyhow::Result<SyncOutcome> {
    apply_device_identity(store, skills_dir);

    // Local changes first — they must be safe before any network step.
    backup_workspace::write_metadata(store, skills_dir)?;
    // Rebuild the oversized exclusions BEFORE the dirty check: a previously
    // excluded skill that shrank below the limit re-enters the backup by
    // making .gitignore (and the skill itself) show up as changes.
    if let Err(e) =
        git_backup::apply_oversized_exclusions(skills_dir, git_backup::SKILL_SIZE_LIMIT_BYTES)
    {
        log::warn!("backup size: exclusion scan failed (continuing): {e:#}");
    }
    let mut committed = false;
    if git_backup::has_uncommitted_changes(skills_dir)? {
        git_backup::commit_all_unlocked(skills_dir, message)?;
        committed = true;
    }

    // The local commit is already safe. Only a new remote with no branch may
    // continue to its first push; failed authentication must stop here.
    let branch = git_backup::current_branch(skills_dir);
    if let Err(error) = git_backup::fetch_branch(skills_dir, &branch) {
        if !crate::core::git_failure::is_missing_remote_branch(&format!("{error:#}")) {
            return Err(error);
        }
    }

    let mut merge_summary: Option<merge::MergeSummary> = None;
    let mut pushed = false;
    let mut snapshot_tag: Option<String> = None;
    for attempt in 0..SYNC_PUSH_ATTEMPTS {
        let status = git_backup::get_status(skills_dir)?;
        if status.behind > 0 {
            let summary = merge::gated_pull_unlocked(store, skills_dir)?;
            backup_workspace::reconcile(store, skills_dir)?;
            merge_summary = Some(summary);
        }

        let status = git_backup::get_status(skills_dir)?;
        let needs_push = committed || status.ahead > 0 || status.upstream_health == "no_upstream";
        if !needs_push {
            break;
        }
        // Reuses an existing tag on HEAD, so retries don't mint duplicates.
        snapshot_tag = Some(git_backup::create_snapshot_tag_unlocked(skills_dir)?);
        match git_backup::push_unlocked(skills_dir) {
            Ok(()) => {
                pushed = true;
                break;
            }
            Err(e) => {
                let msg = format!("{e:#}");
                let rejected = crate::core::git_failure::is_push_race(&msg);
                if !rejected || attempt + 1 == SYNC_PUSH_ATTEMPTS {
                    return Err(e);
                }
                log::info!(
                    "git sync: push rejected (attempt {}), refetching",
                    attempt + 1
                );
                git_backup::fetch_branch(skills_dir, &branch)?;
            }
        }
    }

    if pushed {
        // A successful sync also clears a lingering auto-backup failure card.
        let _ = store.set_setting(crate::core::auto_backup::SETTING_LAST_ERROR, "");
    }
    store.log_audit(
        crate::core::audit_log::AuditDraft::new("sync")
            .detail(format!(
                "committed={} merged={} pushed={}",
                committed,
                merge_summary.is_some(),
                pushed
            ))
            .ok(),
    );
    Ok(SyncOutcome {
        committed,
        merge: merge_summary,
        pushed,
        snapshot_tag,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::Mutex;

    #[test]
    fn rejected_fetch_stops_before_push_and_keeps_local_commit() {
        let _guard = central_repo::test_base_dir_lock();
        git_credentials::use_mock_keyring();
        let temp = tempfile::tempdir().unwrap();
        central_repo::set_test_base_dir_override(Some(temp.path().into()));
        struct Reset;
        impl Drop for Reset {
            fn drop(&mut self) {
                central_repo::set_test_base_dir_override(None);
            }
        }
        let _reset = Reset;
        let store = SkillStore::new(&central_repo::db_path()).unwrap();
        sync_engine_pref(&store);
        let root = central_repo::skills_dir();
        std::fs::create_dir_all(&root).unwrap();
        git_backup::init_repo_unlocked(&root, "Fixture").unwrap();
        std::fs::write(root.join("local-edit.md"), "keep this change").unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}/fixture.git", listener.local_addr().unwrap());
        git_credentials::store_credential(
            &git_credentials::https_host(&url).unwrap(),
            &git_credentials::RemoteCredential {
                username: "fixture".into(),
                password: "rejected-fixture".into(),
            },
        )
        .unwrap();
        for args in [
            vec!["remote", "add", "origin", &url],
            vec!["config", "http.proxy", ""],
            vec!["config", "credential.helper", ""],
        ] {
            assert!(std::process::Command::new("git")
                .arg("-C")
                .arg(&root)
                .args(args)
                .status()
                .unwrap()
                .success());
        }
        let stop = Arc::new(AtomicBool::new(false));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let thread_stop = stop.clone();
        let thread_requests = requests.clone();
        let server = std::thread::spawn(move || {
            while !thread_stop.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((mut socket, _)) => {
                        socket
                            .set_read_timeout(Some(std::time::Duration::from_secs(10)))
                            .unwrap();
                        let mut headers = Vec::new();
                        let mut chunk = [0; 1024];
                        while !headers.windows(4).any(|bytes| bytes == b"\r\n\r\n")
                            && headers.len() < 16384
                        {
                            match socket.read(&mut chunk) {
                                Ok(0) | Err(_) => break,
                                Ok(count) => headers.extend_from_slice(&chunk[..count]),
                            }
                        }
                        if headers.is_empty() {
                            continue;
                        }
                        // Keep only the request line; never retain Authorization headers.
                        let request = String::from_utf8_lossy(&headers)
                            .lines()
                            .next()
                            .unwrap_or("")
                            .to_owned();
                        thread_requests.lock().unwrap().push(request);
                        let _ = socket.write_all(b"HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"fixture\"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(std::time::Duration::from_millis(5))
                    }
                    Err(e) => panic!("fixture listener: {e}"),
                }
            }
        });
        let result = run_sync_blocking(&store, &root, "save local changes");
        stop.store(true, Ordering::Relaxed);
        server.join().unwrap();
        let error = format!("{:#}", result.unwrap_err());
        assert!(
            error.contains("Authentication failed") || error.contains("unable to get password"),
            "{error}"
        );
        let requests = requests.lock().unwrap();
        assert!(
            requests.iter().any(|line| line.contains("git-upload-pack")),
            "missing fetch request: {requests:?}; {error}"
        );
        assert!(
            !requests
                .iter()
                .any(|line| line.contains("git-receive-pack")),
            "push attempted after rejected fetch: {requests:?}"
        );
        assert!(!git_backup::has_uncommitted_changes(&root).unwrap());
        assert_eq!(
            std::fs::read_to_string(root.join("local-edit.md")).unwrap(),
            "keep this change"
        );
    }
    #[test]
    fn missing_remote_branch_allows_first_push() {
        let _guard = central_repo::test_base_dir_lock();
        git_credentials::use_mock_keyring();
        let temp = tempfile::tempdir().unwrap();
        central_repo::set_test_base_dir_override(Some(temp.path().into()));
        struct Reset;
        impl Drop for Reset {
            fn drop(&mut self) {
                central_repo::set_test_base_dir_override(None);
            }
        }
        let _reset = Reset;
        let store = SkillStore::new(&central_repo::db_path()).unwrap();
        sync_engine_pref(&store);
        let root = central_repo::skills_dir();
        std::fs::create_dir_all(&root).unwrap();
        git_backup::init_repo_unlocked(&root, "Fixture").unwrap();
        let remote = temp.path().join("remote.git");
        assert!(std::process::Command::new("git")
            .args(["init", "--bare", "--initial-branch=main"])
            .arg(&remote)
            .output()
            .unwrap()
            .status
            .success());
        assert!(std::process::Command::new("git")
            .arg("-C")
            .arg(&root)
            .args(["remote", "add", "origin"])
            .arg(&remote)
            .status()
            .unwrap()
            .success());
        let outcome = run_sync_blocking(&store, &root, "first backup").unwrap();
        assert!(outcome.pushed);
        let repository = git2::Repository::open_bare(remote).unwrap();
        assert!(repository.find_reference("refs/heads/main").is_ok());
    }
}
