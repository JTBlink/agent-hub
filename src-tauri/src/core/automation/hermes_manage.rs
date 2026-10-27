//! Mutations go through Hermes' supported CLI; never rewrite its jobs.json.
use super::{
    definition::{AutomationDraft, Schedule},
    process, AutomationTask,
};
use std::path::PathBuf;

pub(super) fn home() -> Result<PathBuf, String> {
    std::env::var_os("HERMES_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|p| p.join(".hermes")))
        .ok_or_else(|| "Cannot resolve Hermes home".into())
}

pub(super) fn invoke(root: &std::path::Path, args: &[String]) -> Result<String, String> {
    let executable =
        super::super::tool_detection::find_command("hermes").ok_or("Hermes is not installed")?;
    let args: Vec<_> = args.iter().map(String::as_str).collect();
    process::command(
        &executable.to_string_lossy(),
        &args,
        &[("HERMES_HOME", &root.to_string_lossy()), ("NO_COLOR", "1")],
    )
    .map_err(|e| format!("{e}; refresh task state before retrying"))
}

fn configuration(action: &str, id: Option<&str>, draft: &AutomationDraft) -> Vec<String> {
    let mut args = vec!["cron".into(), action.into()];
    if let Some(id) = id {
        args.push(id.into());
    }
    args.extend([
        "--name".into(),
        draft.name.clone(),
        "--prompt".into(),
        draft.content.clone(),
        "--schedule".into(),
        draft.schedule.display(),
    ]);
    if let Some(workdir) = &draft.workdir {
        args.extend(["--workdir".into(), workdir.clone()]);
    }
    args
}

pub(super) fn create(draft: &AutomationDraft) -> Result<(String, String), String> {
    let root = home()?;
    let output = invoke(&root, &configuration("create", None, draft))?;
    // Hermes currently exposes no JSON option on cron create. Require its
    // explicit success ID, never guess a job from a friendly name or ordering.
    let output = strip_colors(&output);
    let id = output
        .lines()
        .find_map(|line| {
            line.split_once("Created job: ")
                .map(|(_, id)| id.trim().to_string())
        })
        .filter(|id| {
            !id.is_empty()
                && id
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        })
        .ok_or("Hermes did not return a job ID; refresh before creating another task")?;
    if !draft.enabled {
        if let Err(error) = action_at(&root, "pause", &id) {
            let rollback = action_at(&root, "remove", &id);
            return Err(format!("{error}; creation rollback: {rollback:?}"));
        }
    }
    Ok((
        id,
        root.join("cron/jobs.json").to_string_lossy().into_owned(),
    ))
}

fn strip_colors(text: &str) -> String {
    let mut out = String::new();
    let mut sequence = false;
    for ch in text.chars() {
        if ch == '\u{1b}' {
            sequence = true;
            continue;
        }
        if sequence {
            if ch.is_ascii_alphabetic() {
                sequence = false;
            }
            continue;
        }
        out.push(ch);
    }
    out
}

/// Hermes cron run is synchronous and may spend minutes in a model call.
/// Detach its process rather than killing it at the query timeout. Hermes owns
/// the execution claim and persists the result in its own run history.
pub(super) fn run(task: &AutomationTask) -> Result<(), String> {
    if task.status == "paused" {
        return Err("Resume the Hermes schedule before running this task".into());
    }
    if matches!(task.status.as_str(), "completed" | "error") {
        return Err("Resume or repair the Hermes task before running it".into());
    }
    let executable =
        super::super::tool_detection::find_command("hermes").ok_or("Hermes is not installed")?;
    let directory = super::store::root().join("hermes-runs");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    super::super::path_guard::ensure_dir_within_root(&directory, &super::store::root())
        .map_err(|e| e.to_string())?;
    use sha2::{Digest, Sha256};
    let name = format!(
        "{:x}.log",
        Sha256::digest(format!(
            "{}:{}",
            task.location,
            task.identifier.as_deref().unwrap_or("")
        ))
    );
    let output = tempfile::NamedTempFile::new_in(&directory)
        .map_err(|e| e.to_string())?
        .persist(directory.join(name))
        .map_err(|e| e.to_string())?;
    let mut command = std::process::Command::new(executable);
    command
        .args([
            "cron",
            "run",
            task.identifier.as_deref().ok_or("Missing Hermes ID")?,
        ])
        .env("HERMES_HOME", root_for(task)?)
        .env("NO_COLOR", "1")
        .stdin(std::process::Stdio::null())
        .stdout(output.try_clone().map_err(|e| e.to_string())?)
        .stderr(output);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000200);
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

pub(super) fn root_for(task: &AutomationTask) -> Result<PathBuf, String> {
    // Task was resolved from the current authoritative scan, not an IPC path.
    std::path::Path::new(&task.location)
        .parent()
        .and_then(|p| p.parent())
        .map(PathBuf::from)
        .ok_or_else(|| "Invalid Hermes task location".into())
}
pub(super) fn action_at(root: &std::path::Path, action: &str, id: &str) -> Result<(), String> {
    invoke(root, &["cron".into(), action.into(), id.into()]).map(|_| ())
}
pub(super) fn edit(task: &AutomationTask, draft: &AutomationDraft) -> Result<(), String> {
    let root = root_for(task)?;
    if task.project.is_some() && draft.workdir.is_none() {
        return Err("Clear the Hermes working directory in Hermes; empty values are not supported by its CLI".into());
    }
    let id = task.identifier.as_deref().ok_or("Missing Hermes job ID")?;
    invoke(&root, &configuration("edit", Some(id), draft))?;
    if draft.enabled != (task.status != "paused") {
        action_at(&root, if draft.enabled { "resume" } else { "pause" }, id)?;
    }
    Ok(())
}

pub(super) fn draft(task: &AutomationTask) -> AutomationDraft {
    let profile = task
        .id
        .strip_prefix("hermes:")
        .and_then(|s| s.split_once(':'))
        .map(|(p, _)| p);
    let name = if let Some(profile) = profile.filter(|p| *p != "default") {
        task.name
            .strip_suffix(&format!(" · {profile}"))
            .unwrap_or(&task.name)
            .to_string()
    } else {
        task.name.clone()
    };
    AutomationDraft {
        name,
        provider: super::definition::Provider::Hermes,
        content: task.prompt.clone().unwrap_or_default(),
        workdir: task.project.clone(),
        schedule: Schedule::Custom {
            expression: task.schedule.clone(),
        },
        enabled: task.status != "paused",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn prompts_and_names_are_literal_arguments_and_existing_fields_are_not_reset() {
        let draft = AutomationDraft {
            name: "Audit $(ignored)".into(),
            provider: super::super::definition::Provider::Hermes,
            content: "Inspect\n$(literal)".into(),
            workdir: None,
            schedule: Schedule::Interval { minutes: 10 },
            enabled: true,
        };
        let args = configuration("edit", Some("id"), &draft);
        assert!(args.contains(&draft.content));
        assert!(!args.contains(&"--workdir".to_string()));
        assert!(!args.contains(&"--clear-skills".to_string()));
    }
}
