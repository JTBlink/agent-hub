use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Schedule {
    Manual,
    Custom {
        expression: String,
    },
    Interval {
        minutes: u32,
    },
    Daily {
        hour: u8,
        minute: u8,
        weekdays: bool,
    },
}

impl Schedule {
    pub(super) fn validate(&self) -> Result<(), String> {
        match self {
            Self::Custom { expression }
                if expression.trim().is_empty()
                    || expression.len() > 200
                    || expression.contains(['\0', '\n', '\r']) =>
            {
                Err("Invalid Hermes schedule".into())
            }
            Self::Interval { minutes } if !(1..=525600).contains(minutes) => {
                Err("Interval must be between 1 and 525600 minutes".into())
            }
            Self::Daily { hour, minute, .. } if *hour > 23 || *minute > 59 => {
                Err("Invalid local time".into())
            }
            _ => Ok(()),
        }
    }
    pub(super) fn display(&self) -> String {
        match self {
            Self::Manual => "manual".into(),
            Self::Custom { expression } => expression.clone(),
            Self::Interval { minutes } => format!("every {minutes}m"),
            Self::Daily {
                hour,
                minute,
                weekdays,
            } => format!(
                "{minute} {hour} * * {}",
                if *weekdays { "1-5" } else { "*" }
            ),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    System,
    Hermes,
}

/// The same input contract is accepted by IPC and CLI; commands are executed
/// only by an explicit run or the selected scheduler, never while saving.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AutomationDraft {
    pub name: String,
    pub provider: Provider,
    pub content: String,
    pub workdir: Option<String>,
    pub schedule: Schedule,
    pub enabled: bool,
}

impl AutomationDraft {
    pub(super) fn validate(&mut self) -> Result<(), String> {
        self.name = self.name.trim().into();
        if self.name.is_empty() || self.name.len() > 200 || self.name.chars().any(char::is_control)
        {
            return Err("Name must contain 1–200 bytes without control characters".into());
        }
        if self.content.trim().is_empty()
            || self.content.len() > 65536
            || self.content.contains('\0')
        {
            return Err("Command or prompt must contain 1–65536 bytes without NUL".into());
        }
        self.schedule.validate()?;
        if self.provider == Provider::System && matches!(self.schedule, Schedule::Custom { .. }) {
            return Err("Custom expressions are supported by Hermes only".into());
        }
        if self.provider == Provider::Hermes && matches!(self.schedule, Schedule::Manual) {
            return Err(
                "Hermes requires a recurring schedule; use pause and Run now for manual use".into(),
            );
        }
        if let Some(dir) = &self.workdir {
            if dir.is_empty() {
                self.workdir = None;
                return Ok(());
            }
            let path = if dir == "~" || dir.starts_with("~/") {
                dirs::home_dir()
                    .ok_or("Cannot resolve home")?
                    .join(dir.strip_prefix("~/").unwrap_or(""))
            } else {
                dir.into()
            };
            if !path.is_absolute() || !path.is_dir() {
                return Err("Working directory must be an existing absolute directory".into());
            }
            self.workdir = Some(path.to_string_lossy().into_owned());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagedAutomation {
    pub id: String,
    pub revision: u64,
    pub draft: AutomationDraft,
    pub source: String,
    pub identifier: String,
    pub location: String,
}

pub(super) fn valid_id(id: &str) -> bool {
    id.strip_prefix("agent_hub:")
        .is_some_and(|suffix| uuid::Uuid::parse_str(suffix).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_schedules_and_rejects_missing_directories_without_running_commands() {
        let mut draft = AutomationDraft {
            name: "Audit".into(),
            provider: Provider::System,
            content: "exit 99".into(),
            workdir: None,
            schedule: Schedule::Interval { minutes: 0 },
            enabled: true,
        };
        assert!(draft.validate().is_err());
        draft.schedule = Schedule::Daily {
            hour: 9,
            minute: 0,
            weekdays: true,
        };
        assert!(draft.validate().is_ok());
        draft.workdir = Some("relative/path".into());
        assert!(draft.validate().is_err());
        assert!(!valid_id("agent_hub:../../other"));
    }
}
