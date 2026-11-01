use super::*;
#[test]
fn repeated_reads_only_access_keychain_once_per_host() {
    let cache = CredentialCache::default();
    let reads = std::sync::atomic::AtomicUsize::new(0);
    for _ in 0..3 {
        cache
            .read("example.invalid", || {
                reads.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Ok(None)
            })
            .unwrap();
    }
    assert_eq!(reads.load(std::sync::atomic::Ordering::SeqCst), 1);
}
#[test]
fn concurrent_requests_and_denied_reads_do_not_repeat_prompts() {
    let cache = CredentialCache::default();
    let reads = std::sync::atomic::AtomicUsize::new(0);
    std::thread::scope(|scope| {
        for _ in 0..8 {
            let (cache, reads) = (&cache, &reads);
            scope.spawn(move || {
                assert!(cache
                    .read("example.invalid", || {
                        reads.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                        anyhow::bail!("Authorization denied fixture")
                    })
                    .is_err());
            });
        }
    });
    assert_eq!(reads.load(std::sync::atomic::Ordering::SeqCst), 1);
}

#[test]
fn login_rotation_and_logout_update_cached_result_immediately() {
    let cache = CredentialCache::default();
    assert!(cache
        .read("example.invalid", || anyhow::bail!("denied"))
        .is_err());
    for password in ["fixture-one", "fixture-two"] {
        let credential = RemoteCredential {
            username: "fixture".into(),
            password: password.into(),
        };
        cache
            .write("EXAMPLE.INVALID", Some(credential.clone()), || Ok(()))
            .unwrap();
        assert_eq!(
            cache
                .read("example.invalid", || panic!("unnecessary keychain read"))
                .unwrap(),
            Some(credential)
        );
    }
    assert!(cache
        .write("example.invalid", None, || anyhow::bail!("delete failed"))
        .is_err());
    assert!(cache
        .read("example.invalid", || panic!("unnecessary keychain read"))
        .unwrap()
        .is_some());
    cache.write("example.invalid", None, || Ok(())).unwrap();
    assert!(cache
        .read("example.invalid", || panic!("logged out"))
        .unwrap()
        .is_none());
}
