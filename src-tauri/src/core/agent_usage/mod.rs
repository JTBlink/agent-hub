//! Subscription quota queries, independent of projects, terminals and Skill storage.
//! Secrets stay in provider adapters; only quota snapshots cross the IPC boundary.
mod claude;
mod codex;
mod credentials;

use serde::Serialize;
use std::{
    future::Future,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageProvider {
    Claude,
    Codex,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageStatus {
    Ready,
    NotInstalled,
    SignedOut,
    Unsupported,
    CredentialsUnavailable,
    AuthExpired,
    PermissionDenied,
    RateLimited,
    NetworkError,
    InvalidResponse,
    NoData,
    QueryFailed,
}

#[derive(Clone, Debug, Serialize)]
pub struct UsageWindow {
    pub key: String,
    pub used_percent: f64,
    /// Unix seconds, matching provider reset timestamps.
    pub resets_at: Option<i64>,
    pub window_minutes: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ProviderUsage {
    pub provider: UsageProvider,
    pub status: UsageStatus,
    pub windows: Vec<UsageWindow>,
    pub updated_at: i64,
    pub retry_after_seconds: Option<u64>,
}

impl ProviderUsage {
    fn empty(provider: UsageProvider, status: UsageStatus) -> Self {
        Self {
            provider,
            status,
            windows: Vec::new(),
            updated_at: chrono::Utc::now().timestamp(),
            retry_after_seconds: None,
        }
    }

    fn ready(provider: UsageProvider, windows: Vec<UsageWindow>) -> Self {
        let status = if windows.is_empty() {
            UsageStatus::NoData
        } else {
            UsageStatus::Ready
        };
        Self {
            windows,
            ..Self::empty(provider, status)
        }
    }
}

struct CachedUsage {
    snapshot: ProviderUsage,
    checked_at: Instant,
}

/// One cache/lock per provider merges concurrent windows and manual refreshes.
/// Nothing is persisted or placed in the portable backup.
#[derive(Default)]
pub struct AgentUsage {
    claude: Mutex<Option<CachedUsage>>,
    codex: Mutex<Option<CachedUsage>>,
}

impl AgentUsage {
    pub async fn query(&self, refresh: bool, proxy: Option<String>) -> Vec<ProviderUsage> {
        let (claude, codex) = tokio::join!(
            cached_query(&self.claude, refresh, || claude::query(proxy.as_deref())),
            cached_query(&self.codex, refresh, || codex::query(proxy.as_deref())),
        );
        vec![claude, codex]
    }
}

async fn cached_query<F, Fut>(
    cache: &Mutex<Option<CachedUsage>>,
    refresh: bool,
    fetch: F,
) -> ProviderUsage
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = ProviderUsage>,
{
    let mut cached = cache.lock().await;
    if let Some(entry) = cached.as_ref() {
        let minimum = if refresh { 15 } else { 120 };
        let cooldown = if entry.snapshot.status == UsageStatus::RateLimited {
            300
        } else {
            0
        };
        let ttl = minimum.max(entry.snapshot.retry_after_seconds.unwrap_or(cooldown));
        if entry.checked_at.elapsed() < Duration::from_secs(ttl) {
            return entry.snapshot.clone();
        }
    }
    let snapshot = fetch().await;
    *cached = Some(CachedUsage {
        snapshot: snapshot.clone(),
        checked_at: Instant::now(),
    });
    snapshot
}

fn valid_percent(value: &serde_json::Value) -> Option<f64> {
    value
        .as_f64()
        .filter(|n| n.is_finite() && *n >= 0.0 && *n <= 100.0)
}

#[cfg(test)]
mod tests {
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
}
