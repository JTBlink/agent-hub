#[cfg(any(feature = "github", feature = "gitlab"))]
use super::contracts::Provider;
use crate::core::task_browser::{Binding, CliReader, TaskClient, TaskFailure};
use serde::Serialize;
#[cfg(any(feature = "github", feature = "gitlab"))]
use serde_json::Value;
use std::sync::atomic::AtomicBool;

#[cfg(any(feature = "github", feature = "gitlab"))]
pub(super) const MAX_PAGES: usize = 20;

#[derive(Debug, Serialize)]
pub struct ScheduleRule {
    pub cron: String,
    pub timezone: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RepositorySchedule {
    pub id: String,
    pub title: String,
    pub rules: Vec<ScheduleRule>,
    pub target: Option<String>,
    pub active: Option<bool>,
    pub last_status: Option<String>,
    pub last_run_url: Option<String>,
    pub next_run_at: Option<String>,
    pub owner: Option<String>,
    pub url: String,
}

#[derive(Debug, Default, Serialize)]
pub struct RepositorySchedules {
    pub items: Vec<RepositorySchedule>,
    pub limited: bool,
}

#[cfg(any(feature = "github", feature = "gitlab"))]
pub(super) fn field(value: &Value, key: &str) -> Option<String> {
    value[key]
        .as_str()
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

impl<R: CliReader> TaskClient<R> {
    /// Read schedules for a registered repository using that provider's CLI connection.
    pub fn schedules(
        &self,
        binding: &Binding,
        cancel: &AtomicBool,
    ) -> Result<RepositorySchedules, TaskFailure> {
        binding.validate()?;
        let _ = cancel;
        match binding.provider {
            #[cfg(feature = "gitlab")]
            Provider::Gitlab => super::gitlab::schedules::list(self, binding, cancel),
            #[cfg(feature = "github")]
            Provider::Github => super::github::schedules::list(self, binding, cancel),
            #[allow(unreachable_patterns)]
            _ => Err(TaskFailure::new(
                "feature_unavailable",
                "The hosting platform is unavailable",
            )),
        }
    }
}
