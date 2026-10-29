//! Native scheduling and Hermes automation management shared by GUI and CLI.
#[cfg(any(target_os = "macos", test))]
mod app_icons;
pub mod backup;
#[cfg(any(unix, test))]
mod cron;
mod definition;
mod events;
mod hermes;
mod history;
pub(crate) use events::start as start_change_events;
pub use history::{history, run_output, AutomationHistory, AutomationRun};
mod output;
pub use output::{output, AutomationRunOutput};
#[cfg(target_os = "macos")]
mod external_launchd;
mod hermes_manage;
#[cfg(any(target_os = "macos", test))]
mod launchd;
#[cfg(any(target_os = "macos", test))]
mod launchd_names;
#[cfg(any(target_os = "linux", test))]
mod linux;
mod local_data;
mod managed;
mod native;
mod process;
mod script_sync;
mod store;
pub use script_sync::sync_workspace_scripts;
mod templates;
mod workspace;
pub use backup::{shell as command_shell, AutomationBackup};
pub use templates::{template, templates, AutomationCatalog};
pub(crate) fn watch_dir() -> std::path::PathBuf {
    store::root()
}
pub(crate) fn has_pending_backup() -> bool {
    backup::needs_export()
}
pub use definition::{
    AutomationDraft, AutomationScriptFile, ManagedAutomation, Provider, Schedule,
};
pub use managed::{remove, remove_with_local_data, run, save};
#[cfg(any(windows, test))]
mod windows;

use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskOrigin {
    AgentHub,
    External,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct AutomationTask {
    pub id: String,
    pub name: String,
    pub identifier: Option<String>,
    pub bundle_id: Option<String>,
    pub icon: Option<String>,
    pub source: String,
    pub origin: TaskOrigin,
    pub can_edit: bool,
    pub can_run: bool,
    pub definition: Option<AutomationDraft>,
    pub revision: Option<u64>,
    /// Known operating-system maintenance jobs; retained so the UI can reveal them.
    pub is_builtin: bool,
    pub schedule: String,
    pub project: Option<String>,
    pub next_run: Option<String>,
    pub last_run: Option<String>,
    pub status: String,
    pub last_result: Option<String>,
    pub command: Option<String>,
    pub prompt: Option<String>,
    pub location: String,
}

impl AutomationTask {
    fn new(id: String, name: String, source: &str, location: String) -> Self {
        Self {
            id,
            name,
            identifier: None,
            bundle_id: None,
            icon: None,
            source: source.into(),
            origin: TaskOrigin::External,
            can_edit: source == "hermes",
            can_run: source == "hermes",
            definition: None,
            revision: None,
            is_builtin: false,
            location,
            schedule: String::new(),
            project: None,
            next_run: None,
            last_run: None,
            status: "unknown".into(),
            last_result: None,
            command: None,
            prompt: None,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct SourceIssue {
    pub source: String,
    pub message: String,
}

#[derive(Default, Debug, Serialize)]
pub struct AutomationOverview {
    pub tasks: Vec<AutomationTask>,
    pub issues: Vec<SourceIssue>,
    pub hermes_installed: bool,
}

impl AutomationOverview {
    fn collect(&mut self, source: &str, result: Result<Vec<AutomationTask>, String>) {
        match result {
            Ok(tasks) => self.tasks.extend(tasks),
            Err(message) => self.issue(source, message),
        }
    }

    fn issue(&mut self, source: &str, message: String) {
        self.issues.push(SourceIssue {
            source: source.into(),
            message: super::log_sanitize::sanitize(&message),
        });
    }
}

/// Query each source independently; no scheduler, task or configuration is modified.
pub fn overview(locale: Option<&str>) -> AutomationOverview {
    #[cfg(not(target_os = "macos"))]
    let _ = locale;
    let mut report = AutomationOverview {
        hermes_installed: super::tool_detection::is_installed("hermes"),
        ..Default::default()
    };
    #[cfg(target_os = "macos")]
    {
        launchd::collect(&mut report, locale.unwrap_or("en"));
        cron::collect(&mut report);
    }
    #[cfg(target_os = "linux")]
    {
        linux::collect(&mut report);
        cron::collect(&mut report);
    }
    #[cfg(windows)]
    windows::collect(&mut report);
    if report.hermes_installed {
        hermes::collect(&mut report);
    }
    managed::merge(&mut report, &store::root());
    report.tasks.sort_by_key(|task| task.name.to_lowercase());
    report
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_source_failure_preserves_tasks_from_other_sources() {
        let mut report = AutomationOverview::default();
        report.collect(
            "cron",
            Ok(vec![AutomationTask::new(
                "cron:1".into(),
                "Backup".into(),
                "cron",
                "crontab".into(),
            )]),
        );
        report.collect("hermes", Err("invalid jobs JSON".into()));
        assert_eq!(report.tasks.len(), 1);
        assert_eq!(report.issues.len(), 1);
        assert_eq!(report.issues[0].source, "hermes");
    }
}
