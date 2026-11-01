use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};

#[tokio::test]
async fn merges_concurrent_refreshes_and_keeps_rate_limit_cooldown() {
    let cache = Mutex::new(None);
    let calls = AtomicUsize::new(0);
    let fetch = || async {
        calls.fetch_add(1, Ordering::SeqCst);
        tokio::task::yield_now().await;
        let mut result = ProviderUsage::empty(UsageProvider::Claude, UsageStatus::RateLimited);
        result.retry_after_seconds = Some(300);
        result
    };
    let (first, second) = tokio::join!(
        cached_query(&cache, true, fetch),
        cached_query(&cache, true, fetch)
    );
    assert_eq!(first.status, UsageStatus::RateLimited);
    assert_eq!(second.status, first.status);
    cache.lock().await.as_mut().unwrap().checked_at = Instant::now() - Duration::from_secs(200);
    cached_query(&cache, true, fetch).await;
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    cache.lock().await.as_mut().unwrap().checked_at = Instant::now() - Duration::from_secs(301);
    cached_query(&cache, false, fetch).await;
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn manual_refresh_bypasses_normal_ttl_but_failed_queries_clear_old_numbers() {
    let cache = Mutex::new(Some(CachedUsage {
        snapshot: ProviderUsage::ready(
            UsageProvider::Codex,
            vec![UsageWindow {
                key: "primary".into(),
                used_percent: 50.0,
                resets_at: None,
                window_minutes: None,
            }],
        ),
        checked_at: Instant::now() - Duration::from_secs(16),
    }));
    let snapshot = cached_query(&cache, true, || async {
        ProviderUsage::empty(UsageProvider::Codex, UsageStatus::AuthExpired)
    })
    .await;
    assert_eq!(snapshot.status, UsageStatus::AuthExpired);
    assert!(snapshot.windows.is_empty());
}

#[tokio::test]
async fn retries_transient_failures_without_waiting_for_the_success_cache_ttl() {
    for status in [
        UsageStatus::NetworkError,
        UsageStatus::QueryFailed,
        UsageStatus::InvalidResponse,
    ] {
        let cache = Mutex::new(Some(CachedUsage {
            snapshot: ProviderUsage::empty(UsageProvider::Codex, status),
            checked_at: Instant::now() - Duration::from_secs(31),
        }));
        let snapshot = cached_query(&cache, false, || async {
            ProviderUsage::ready(UsageProvider::Codex, vec![])
        })
        .await;
        assert_ne!(snapshot.status, status);
    }
}
