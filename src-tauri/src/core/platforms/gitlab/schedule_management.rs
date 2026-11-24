use crate::core::platforms::schedules::{ScheduleConfig, ScheduleEdit};
use crate::core::task_browser::{Binding, CliReader, TaskClient, TaskFailure};
use serde_json::Value;
use std::sync::atomic::AtomicBool;

fn endpoint(binding: &Binding, id: u64) -> Result<String, TaskFailure> {
    if id == 0 {
        return Err(TaskFailure::new(
            "invalid_input",
            "Invalid pipeline schedule ID",
        ));
    }
    Ok(format!(
        "projects/{}/pipeline_schedules/{id}",
        urlencoding::encode(&binding.repository)
    ))
}

fn config(value: &Value, id: u64) -> Result<ScheduleConfig, TaskFailure> {
    let invalid = || {
        TaskFailure::new(
            "invalid_response",
            "GitLab returned invalid schedule settings",
        )
    };
    if value["id"].as_u64() != Some(id) {
        return Err(invalid());
    }
    let text = |key: &str| {
        value[key]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .ok_or_else(invalid)
    };
    Ok(ScheduleConfig {
        title: text("description")?,
        target: text("ref")?,
        cron: text("cron")?,
        timezone: text("cron_timezone")?,
        active: value["active"].as_bool().ok_or_else(invalid)?,
    })
}

impl ScheduleEdit {
    fn fields(&self) -> Result<Vec<(&'static str, String)>, TaskFailure> {
        let mut fields = Vec::new();
        for (key, value) in [
            ("description", &self.title),
            ("ref", &self.target),
            ("cron", &self.cron),
            ("cron_timezone", &self.timezone),
        ] {
            if let Some(value) = value {
                if value.trim().is_empty() || value.contains('\0') {
                    return Err(TaskFailure::new(
                        "invalid_input",
                        "Schedule fields must not be empty",
                    ));
                }
                fields.push((key, value.clone()));
            }
        }
        if let Some(active) = self.active {
            fields.push(("active", active.to_string()));
        }
        if fields.is_empty() {
            return Err(TaskFailure::new(
                "invalid_input",
                "No schedule changes supplied",
            ));
        }
        Ok(fields)
    }
}

/// Load current settings before editing, without returning pipeline secrets.
pub(crate) fn details<R: CliReader>(
    cli: &TaskClient<R>,
    binding: &Binding,
    id: u64,
    cancel: &AtomicBool,
) -> Result<ScheduleConfig, TaskFailure> {
    config(&cli.api(binding, endpoint(binding, id)?, cancel)?, id)
}

/// Patch supplied fields, preserving variables, inputs and other schedule settings.
pub(crate) fn edit<R: CliReader>(
    cli: &TaskClient<R>,
    binding: &Binding,
    id: u64,
    edit: &ScheduleEdit,
    cancel: &AtomicBool,
) -> Result<ScheduleConfig, TaskFailure> {
    let path = endpoint(binding, id)?;
    let fields = edit.fields()?;
    config(&cli.request(binding, "PUT", path, &fields, cancel)?, id)
}

/// Delete a schedule using its repository-scoped ID and current CLI identity.
pub(crate) fn delete<R: CliReader>(
    cli: &TaskClient<R>,
    binding: &Binding,
    id: u64,
    cancel: &AtomicBool,
) -> Result<(), TaskFailure> {
    cli.request(binding, "DELETE", endpoint(binding, id)?, &[], cancel)?;
    Ok(())
}

pub(crate) fn run<R: CliReader>(
    cli: &TaskClient<R>,
    binding: &Binding,
    id: u64,
    cancel: &AtomicBool,
) -> Result<(), TaskFailure> {
    cli.request(
        binding,
        "POST",
        format!("{}/play", endpoint(binding, id)?),
        &[],
        cancel,
    )?;
    Ok(())
}
