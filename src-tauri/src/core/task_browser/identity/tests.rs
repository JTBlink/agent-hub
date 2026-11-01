use super::*;
use std::sync::atomic::AtomicUsize;

fn scope() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[test]
fn reuses_login_until_expiry_or_invalidation_and_never_caches_failures() {
    let key = scope();
    let cancel = AtomicBool::new(false);
    assert_eq!(get(&key, &cancel, || Ok("first".into())).unwrap(), "first");
    assert_eq!(
        get(&key, &cancel, || panic!("fresh login must be reused")).unwrap(),
        "first"
    );
    let entry = cache().lock().unwrap().get(&key).unwrap().1.clone();
    entry.lock().unwrap().as_mut().unwrap().0 = Instant::now() - TTL;
    assert_eq!(
        get(&key, &cancel, || Ok("second".into())).unwrap(),
        "second"
    );
    invalidate(&key);
    assert!(get(&key, &cancel, || Err(TaskFailure::new(
        "network", "offline"
    )))
    .is_err());
    assert_eq!(get(&key, &cancel, || Ok("third".into())).unwrap(), "third");
    assert_eq!(
        get(&scope(), &cancel, || Ok("other host".into())).unwrap(),
        "other host"
    );
    assert_eq!(
        get(&key, &cancel, || panic!(
            "another scope must not replace this login"
        ))
        .unwrap(),
        "third"
    );
}

#[test]
fn concurrent_reads_share_one_login_and_cancelled_waiters_leave_it_running() {
    let key = scope();
    let reads = AtomicUsize::new(0);
    let barrier = std::sync::Barrier::new(4);
    std::thread::scope(|threads| {
        let handles: Vec<_> = (0..4)
            .map(|_| {
                threads.spawn(|| {
                    barrier.wait();
                    get(&key, &AtomicBool::new(false), || {
                        reads.fetch_add(1, Ordering::SeqCst);
                        std::thread::sleep(Duration::from_millis(60));
                        Ok("demo".into())
                    })
                    .unwrap()
                })
            })
            .collect();
        for handle in handles {
            assert_eq!(handle.join().unwrap(), "demo");
        }
    });
    assert_eq!(reads.load(Ordering::SeqCst), 1);
    let entry = cache().lock().unwrap().get(&key).unwrap().1.clone();
    let _owner = entry.lock().unwrap();
    assert_eq!(
        get(&key, &AtomicBool::new(true), || panic!(
            "cancelled waiter must not fetch"
        ))
        .unwrap_err()
        .kind,
        "cancelled"
    );
}

#[test]
fn login_scope_separates_hosts_providers_and_project_launchers() {
    use super::super::{Binding, CliLauncher, CliReader, Provider, SystemCli};
    let cli = SystemCli {
        cwd: "project-a".into(),
    };
    let other = SystemCli {
        cwd: "project-b".into(),
    };
    let mut binding = Binding {
        id: scope(),
        project_id: "demo".into(),
        provider: Provider::Github,
        host: "git.example.invalid".into(),
        repository: "team/demo".into(),
        launcher: None,
    };
    let github = cli.identity_scope(&binding);
    assert_eq!(github, other.identity_scope(&binding));
    binding.provider = Provider::Gitlab;
    assert_ne!(github, cli.identity_scope(&binding));
    binding.host = "another.example.invalid".into();
    assert_ne!(github, cli.identity_scope(&binding));
    binding.launcher = Some(CliLauncher {
        program: "launcher".into(),
        args: vec!["--profile=demo".into()],
    });
    assert_ne!(cli.identity_scope(&binding), other.identity_scope(&binding));
}
