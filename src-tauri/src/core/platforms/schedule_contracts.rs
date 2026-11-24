use serde::{Deserialize, Serialize};

/// Editable schedule fields only; variables and inputs never leave the platform.
#[derive(Debug, Serialize)]
pub struct ScheduleConfig {
    pub title: String,
    pub target: String,
    pub cron: String,
    pub timezone: String,
    pub active: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScheduleEdit {
    pub title: Option<String>,
    pub target: Option<String>,
    pub cron: Option<String>,
    pub timezone: Option<String>,
    pub active: Option<bool>,
}
