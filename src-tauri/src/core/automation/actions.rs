//! Optional task-defined operations. The platform never interprets business counters.
use super::{native, package, store, AutomationDraft, ManagedAutomation};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::Path, sync::atomic::AtomicBool};

const CONFIG: &str = "config/actions.json";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AutomationAction {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub script: String,
    #[serde(default)]
    pub arguments: Vec<String>,
    #[serde(default)]
    pub confirmation: String,
    /// Optional read-only invocation returning a structured preview.
    #[serde(default)]
    pub preview_arguments: Option<Vec<String>>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    version: u32,
    actions: Vec<AutomationAction>,
}

pub(super) fn read(draft: &AutomationDraft) -> Result<Vec<AutomationAction>, String> {
    let Some(file) = draft.files.iter().find(|file| file.path == CONFIG) else {
        return Ok(vec![]);
    };
    let manifest: Manifest = serde_json::from_str(&file.content)
        .map_err(|error| format!("Invalid custom actions: {error}"))?;
    if manifest.version != 1 || manifest.actions.len() > 12 {
        return Err("Custom actions require version 1 and at most 12 operations".into());
    }
    let mut ids = HashSet::new();
    for action in &manifest.actions {
        if action.id.is_empty()
            || action.id.len() > 64
            || !action
                .id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
            || !ids.insert(&action.id)
            || action.name.trim().is_empty()
            || action.name.len() > 200
            || action.name.chars().any(char::is_control)
            || action.description.len() > 2000
            || action.description.contains('\0')
            || action.confirmation.len() > 2000
            || action.confirmation.contains('\0')
            || action.preview_arguments.as_ref().is_some_and(|args| {
                args.len() > 32
                    || args
                        .iter()
                        .any(|value| value.len() > 2000 || value.contains('\0'))
            })
            || action.arguments.len() > 32
            || action
                .arguments
                .iter()
                .any(|value| value.len() > 2000 || value.contains('\0'))
        {
            return Err("Invalid custom action name, ID, description or arguments".into());
        }
        crate::core::path_guard::ensure_safe_skill_relative_path(&action.script)
            .map_err(|e| e.to_string())?;
        if action.script.contains(['\\', ':'])
            || ![".sh", ".ps1", ".py"]
                .iter()
                .any(|suffix| action.script.ends_with(suffix))
            || !draft.files.iter().any(|file| file.path == action.script)
        {
            return Err(
                "Custom actions must reference a declared .sh, .ps1 or .py task file".into(),
            );
        }
    }
    Ok(manifest.actions)
}

#[derive(Serialize)]
pub struct AutomationActionResult {
    pub run_id: String,
    pub success: bool,
    pub message: String,
    pub preview: Option<ActionPreview>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ActionPreview {
    pub summary: String,
    #[serde(default)]
    pub items: Vec<PreviewItem>,
    #[serde(default)]
    pub preserved: Vec<String>,
    pub token: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PreviewItem {
    pub label: String,
    pub current: String,
    pub after: String,
}

/// Execute only the saved action, never a command supplied by the invoking UI.
pub fn run(
    id: &str,
    action_id: &str,
    revision: u64,
    preview: bool,
    token: Option<&str>,
) -> Result<AutomationActionResult, String> {
    if token.is_some_and(|value| value.len() > 2000 || value.contains('\0')) {
        return Err("Invalid preview token".into());
    }
    let root = store::root();
    let _lock = package::lock(&root, id)?;
    let record = package::find(&root, id)?;
    if record.revision != revision {
        return Err("Task changed; refresh before executing a custom action".into());
    }
    let task = super::managed::find(id)?;
    if !task.can_run || task.status == "running" {
        return Err("Wait for the current run to finish before executing a custom action".into());
    }
    let directory = package::checked(&root, &record)?;
    let action = read(&record.draft)?
        .into_iter()
        .find(|action| action.id == action_id)
        .ok_or("Custom action is no longer available; refresh the task")?;
    if preview && action.preview_arguments.is_none() {
        return Err("This action has no preview".into());
    }
    if !preview && action.preview_arguments.is_some() && token.map_or(true, str::is_empty) {
        return Err("Preview this action before executing it".into());
    }
    execute(&directory, &record, &action, preview, token)
}

struct Claim(std::path::PathBuf);
impl Drop for Claim {
    fn drop(&mut self) {
        let _ = fs::remove_dir(&self.0);
    }
}

fn execute(
    directory: &Path,
    record: &ManagedAutomation,
    action: &AutomationAction,
    preview: bool,
    token: Option<&str>,
) -> Result<AutomationActionResult, String> {
    let local = directory.join(".local");
    let claim = local.join("run.claim");
    fs::create_dir(&claim)
        .map_err(|_| "Task is busy; custom action was not executed".to_string())?;
    let _claim = Claim(claim);
    let state_entry = native::bundle_files::path(
        &directory.to_string_lossy(),
        ".local/state/placeholder",
        true,
    )?;
    let state = state_entry.parent().ok_or("Missing state directory")?;
    // An Agent may remain active after its scheduling controller has exited.
    if let Some(checkpoint) =
        crate::core::agent_execution::status_at(state).map_err(|e| e.to_string())?
    {
        if checkpoint.get("phase").and_then(|value| value.as_str()) != Some("completed") {
            return Err(
                "An Agent execution is unresolved; finish it before executing a custom action"
                    .into(),
            );
        }
    }
    let script = native::bundle_files::path(&directory.to_string_lossy(), &action.script, false)?;
    let metadata = fs::symlink_metadata(&script).map_err(|e| e.to_string())?;
    if !metadata.is_file() || crate::core::path_guard::is_link_or_reparse_point(&metadata) {
        return Err("Custom action script must be a regular task file".into());
    }
    let program = if action.script.ends_with(".py") {
        let marker = local.join("python-path");
        super::output::checked(&local, &marker)?;
        match native::payload::read_file_with_limit(&marker, 4096)? {
            Some(value) if Path::new(value.trim()).is_absolute() => value.trim().into(),
            Some(_) => return Err("Invalid task Python environment".into()),
            None => native::python_runtime()?,
        }
    } else if action.script.ends_with(".ps1") {
        "powershell.exe".into()
    } else if cfg!(windows) {
        return Err("Shell actions require a .ps1 or .py script on Windows".into());
    } else {
        "/bin/sh".into()
    };
    let run_id = format!("action-{}", uuid::Uuid::new_v4());
    let runs = native::bundle_files::path(
        &directory.to_string_lossy(),
        ".local/runs/placeholder",
        true,
    )?;
    let run = runs.parent().ok_or("Missing runs directory")?.join(&run_id);
    fs::create_dir(&run).map_err(|e| e.to_string())?;
    store::write(
        &run.join("started"),
        chrono::Utc::now().to_rfc3339().as_bytes(),
    )?;
    let variables = serde_json::to_string(&super::definition::prompt_variants::active_variables(
        &record.draft,
    )?)
    .map_err(|e| e.to_string())?;
    let mut command = std::process::Command::new(&program);
    if action.script.ends_with(".ps1") {
        command.args(["-NoProfile", "-NonInteractive", "-File"]);
    }
    command
        .arg(script)
        .args(if preview {
            action
                .preview_arguments
                .as_ref()
                .ok_or("Missing preview arguments")?
        } else {
            &action.arguments
        })
        .current_dir(
            record
                .draft
                .workdir
                .as_deref()
                .map(Path::new)
                .unwrap_or(directory),
        )
        .env("AGENT_HUB_TASK_DIR", directory)
        .env("AGENT_HUB_SCRIPT_DIR", directory)
        .env("AGENT_HUB_STATE_DIR", state)
        .env("AGENT_HUB_VARIABLES_JSON", variables)
        .env("AGENT_HUB_ACTION_ID", &action.id)
        .env("AGENT_HUB_ACTION_PREVIEW_TOKEN", token.unwrap_or(""))
        .env("AGENT_HUB_CLI", crate::core::cli_bridge::bridge_path());
    let result = crate::core::cli_process::capture_prepared(
        command,
        "Custom action",
        60,
        Some(&AtomicBool::new(false)),
    );
    let mut success = result.is_ok();
    let message = match result {
        Ok((stdout, stderr)) => format!("{stdout}{stderr}"),
        Err(error) => error,
    };
    let preview_result = if preview && success && message.len() <= 256 * 1024 {
        match serde_json::from_str::<ActionPreview>(&message) {
            Ok(value)
                if value.items.len() <= 200
                    && value.preserved.len() <= 100
                    && !value.token.is_empty()
                    && value.token.len() <= 2000 =>
            {
                Some(value)
            }
            _ => {
                success = false;
                None
            }
        }
    } else {
        None
    };
    if preview && preview_result.is_none() {
        success = false;
    }
    let log = format!(
        "Custom action: {} ({})\n{}\n",
        action.name, action.id, message
    );
    store::write(&run.join("output.log"), log.as_bytes())?;
    store::write(
        &run.join("finished"),
        chrono::Utc::now().to_rfc3339().as_bytes(),
    )?;
    store::write(&run.join("exit"), if success { b"0" } else { b"1" })?;
    prune_action_logs(run.parent().ok_or("Missing run directory")?)?;
    Ok(AutomationActionResult {
        run_id,
        success,
        message,
        preview: preview_result,
    })
}

fn prune_action_logs(runs: &Path) -> Result<(), String> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(runs).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry
            .file_name()
            .to_str()
            .and_then(|name| name.strip_prefix("action-"))
            .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
        {
            let metadata = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
            if metadata.is_dir() && !crate::core::path_guard::is_link_or_reparse_point(&metadata) {
                entries.push((
                    metadata.modified().map_err(|e| e.to_string())?,
                    entry.path(),
                ));
            }
        }
    }
    entries.sort_by_key(|entry| std::cmp::Reverse(entry.0));
    for (_, path) in entries.into_iter().skip(100) {
        fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;
