#[path = "schedule_contracts.rs"]
mod config;
#[cfg(any(feature = "github", feature = "gitlab"))]
use super::contracts::Provider;
use crate::core::task_browser::{Binding, CliReader, TaskClient, TaskFailure};
pub use config::{ScheduleConfig, ScheduleEdit};
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
    pub last_run_id: Option<u64>,
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

#[derive(Debug, Default, Serialize)]
pub struct ScheduleProgress {
    pub total: usize,
    pub finished: usize,
    pub running: usize,
    pub waiting: usize,
    pub status: Option<String>,
    pub limited: bool,
}

#[cfg(any(feature = "github", feature = "gitlab"))]
pub(super) enum JobState {
    Finished,
    Running,
    Waiting,
    Unknown,
}

#[cfg(any(feature = "github", feature = "gitlab"))]
impl ScheduleProgress {
    pub(super) fn record(&mut self, state: JobState) {
        self.total += 1;
        match state {
            JobState::Finished => self.finished += 1,
            JobState::Running => self.running += 1,
            JobState::Waiting => self.waiting += 1,
            JobState::Unknown => (),
        }
    }
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

    /// Dispatch run schedule to the selected platform implementation.
    pub fn run_schedule(
        &self,
        binding: &Binding,
        schedule_id: u64,
        cancel: &AtomicBool,
    ) -> Result<(), TaskFailure> {
        binding.validate()?;
        let _ = (schedule_id, cancel);
        match binding.provider {
            #[cfg(feature = "gitlab")]
            Provider::Gitlab => {
                super::gitlab::schedule_management::run(self, binding, schedule_id, cancel)
            }
            #[allow(unreachable_patterns)]
            _ => Err(TaskFailure::new(
                "feature_unavailable",
                "Schedule management is unavailable for this platform",
            )),
        }
    }

    /// Dispatch schedule config to the selected platform implementation.
    pub fn schedule_config(
        &self,
        binding: &Binding,
        schedule_id: u64,
        cancel: &AtomicBool,
    ) -> Result<ScheduleConfig, TaskFailure> {
        binding.validate()?;
        let _ = (schedule_id, cancel);
        match binding.provider {
            #[cfg(feature = "gitlab")]
            Provider::Gitlab => {
                super::gitlab::schedule_management::details(self, binding, schedule_id, cancel)
            }
            #[allow(unreachable_patterns)]
            _ => Err(TaskFailure::new(
                "feature_unavailable",
                "Schedule management is unavailable for this platform",
            )),
        }
    }

    /// Dispatch edit schedule to the selected platform implementation.
    pub fn edit_schedule(
        &self,
        binding: &Binding,
        schedule_id: u64,
        edit: &ScheduleEdit,
        cancel: &AtomicBool,
    ) -> Result<ScheduleConfig, TaskFailure> {
        binding.validate()?;
        let _ = (schedule_id, cancel);
        let _ = edit;
        match binding.provider {
            #[cfg(feature = "gitlab")]
            Provider::Gitlab => {
                super::gitlab::schedule_management::edit(self, binding, schedule_id, edit, cancel)
            }
            #[allow(unreachable_patterns)]
            _ => Err(TaskFailure::new(
                "feature_unavailable",
                "Schedule management is unavailable for this platform",
            )),
        }
    }

    /// Dispatch delete schedule to the selected platform implementation.
    pub fn delete_schedule(
        &self,
        binding: &Binding,
        schedule_id: u64,
        cancel: &AtomicBool,
    ) -> Result<(), TaskFailure> {
        binding.validate()?;
        let _ = (schedule_id, cancel);
        match binding.provider {
            #[cfg(feature = "gitlab")]
            Provider::Gitlab => {
                super::gitlab::schedule_management::delete(self, binding, schedule_id, cancel)
            }
            #[allow(unreachable_patterns)]
            _ => Err(TaskFailure::new(
                "feature_unavailable",
                "Schedule management is unavailable for this platform",
            )),
        }
    }

    /// Read job activity for a run scoped to the selected repository.
    pub fn schedule_progress(
        &self,
        binding: &Binding,
        run_id: u64,
        cancel: &AtomicBool,
    ) -> Result<ScheduleProgress, TaskFailure> {
        binding.validate()?;
        if run_id == 0 {
            return Err(TaskFailure::new("invalid_input", "Invalid pipeline run ID"));
        }
        let _ = cancel;
        match binding.provider {
            #[cfg(feature = "gitlab")]
            Provider::Gitlab => super::gitlab::schedules::progress(self, binding, run_id, cancel),
            #[cfg(feature = "github")]
            Provider::Github => super::github::schedules::progress(self, binding, run_id, cancel),
            #[allow(unreachable_patterns)]
            _ => Err(TaskFailure::new(
                "feature_unavailable",
                "The hosting platform is unavailable",
            )),
        }
    }
}
