//! Local-only run evidence. Neither reads nor runtime writes enqueue Git backups.
use super::{hermes_manage, managed, native, output, store};
use serde::Serialize;
use std::{fs, io::Read, path::Path};

#[derive(Debug, Clone, Serialize)]
pub struct AutomationRun {
    pub id: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub status: String,
    pub exit_code: Option<i32>,
    pub has_output: bool,
}
#[derive(Debug, Serialize)]
pub struct AutomationHistory {
    pub runs: Vec<AutomationRun>,
    pub kind: String,
    pub limited: bool,
}
fn component(id: &str) -> bool {
    !id.is_empty()
        && id != "."
        && id != ".."
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
}
fn marker(root: &Path, path: &Path) -> Result<Option<String>, String> {
    output::checked(root, path)?;
    match fs::metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
        Ok(meta) if !meta.is_file() || meta.len() > 4096 => {
            return Err("Invalid execution marker".into())
        }
        _ => {}
    }
    let mut value = String::new();
    fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(4096)
        .read_to_string(&mut value)
        .map_err(|e| e.to_string())?;
    Ok(Some(value.trim().into()))
}
fn native_run(root: &Path, path: &Path, id: &str) -> Result<Option<AutomationRun>, String> {
    let Some(started) = marker(root, &path.join("started"))? else {
        return Ok(None);
    };
    let exit_code = marker(root, &path.join("exit"))?.and_then(|s| s.parse::<i32>().ok());
    output::checked(root, &path.join("output.log"))?;
    Ok(Some(AutomationRun {
        id: id.into(),
        started_at: Some(started),
        finished_at: marker(root, &path.join("finished"))?,
        status: match exit_code {
            Some(0) => "completed",
            Some(_) => "error",
            None => "unknown",
        }
        .into(),
        exit_code,
        has_output: path.join("output.log").is_file(),
    }))
}
fn native_history(dir: &Path, running: impl FnOnce() -> bool) -> Result<AutomationHistory, String> {
    let current = marker(dir, &dir.join("current-run"))?;
    let directory = dir.join("runs");
    output::checked(dir, &directory)?;
    let entries = match fs::read_dir(&directory) {
        Ok(entries) => Some(entries),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(e.to_string()),
    };
    let mut runs = vec![];
    if let Some(entries) = entries {
        for entry in entries {
            let path = entry.map_err(|e| e.to_string())?.path();
            let Some(id) = path
                .file_name()
                .and_then(|n| n.to_str())
                .filter(|id| component(id))
            else {
                continue;
            };
            output::checked(dir, &path)?;
            if path.is_dir() {
                if let Some(run) = native_run(dir, &path, id)? {
                    runs.push(run);
                }
            }
        }
    }
    if runs.is_empty() && current.is_none() {
        if let Some(run) = native_run(dir, dir, "legacy")? {
            runs.push(run);
        }
    }
    runs.sort_by(|a, b| {
        (current.as_deref() == Some(b.id.as_str()))
            .cmp(&(current.as_deref() == Some(a.id.as_str())))
            .then_with(|| b.started_at.cmp(&a.started_at))
            .then_with(|| b.id.cmp(&a.id))
    });
    let limited = runs.len() > 100;
    runs.truncate(100);
    // Finished histories are entirely local. Only the unfinished current run
    // needs one scheduler check; older unfinished runs remain unknown.
    if let Some(run) = runs.iter_mut().find(|run| {
        run.exit_code.is_none()
            && (current.as_deref() == Some(&run.id) || (current.is_none() && run.id == "legacy"))
    }) {
        if running() {
            run.status = "running".into();
        }
    }
    Ok(AutomationHistory {
        runs,
        kind: "executions".into(),
        limited,
    })
}
fn for_task(task: &super::AutomationTask) -> Result<AutomationHistory, String> {
    if task.source == "hermes" {
        let home = hermes_manage::root_for(task)?;
        let outputs = output::hermes_outputs(
            &home,
            task.identifier.as_deref().ok_or("Missing Hermes job ID")?,
        )?;
        let limited = outputs.len() > 100;
        let runs = outputs
            .into_iter()
            .take(100)
            .filter_map(|path| {
                let id = path.file_name()?.to_str()?.to_owned();
                let saved = chrono::NaiveDateTime::parse_from_str(
                    id.trim_end_matches(".md"),
                    "%Y-%m-%d_%H-%M-%S",
                )
                .ok()?;
                Some(AutomationRun {
                    finished_at: Some(saved.format("%Y-%m-%d %H:%M:%S").to_string()),
                    id,
                    started_at: None,
                    status: "unknown".into(),
                    exit_code: None,
                    has_output: true,
                })
            })
            .collect();
        Ok(AutomationHistory {
            runs,
            kind: "hermes_outputs".into(),
            limited,
        })
    } else if let Some(dir) = output::native_directory(task)? {
        native_history(&dir, || task.status == "running")
    } else {
        Ok(AutomationHistory {
            runs: vec![],
            kind: "unsupported".into(),
            limited: false,
        })
    }
}
pub fn history(id: &str) -> Result<AutomationHistory, String> {
    if let Some((record, dir)) = output::native_task_at(&store::root(), id)? {
        return native_history(&dir, || native::is_running(&record));
    }
    for_task(&managed::find(id)?)
}
pub fn run_output(id: &str, run_id: &str) -> Result<output::AutomationRunOutput, String> {
    if !component(run_id) {
        return Err("Invalid execution ID".into());
    }
    if let Some((_, root)) = output::native_task_at(&store::root(), id)? {
        // Output membership is local; reading a saved log needs no live status.
        let report = native_history(&root, || false)?;
        if !report.runs.iter().any(|run| run.id == run_id) {
            return Err("Execution record is no longer available; refresh the history".into());
        }
        return native_output(&root, run_id);
    }
    let task = managed::find(id)?;
    let report = for_task(&task)?;
    if !report.runs.iter().any(|run| run.id == run_id) {
        return Err("Execution record is no longer available; refresh the history".into());
    }
    let (root, path, kind) = if task.source == "hermes" {
        let root = hermes_manage::root_for(&task)?;
        let path = output::hermes_outputs(
            &root,
            task.identifier.as_deref().ok_or("Missing Hermes job ID")?,
        )?
        .into_iter()
        .find(|path| path.file_name().is_some_and(|name| name == run_id))
        .ok_or("Result file is no longer available")?;
        (root, path, "hermes")
    } else {
        let root = output::native_directory(&task)?.ok_or("Missing task directory")?;
        return native_output(&root, run_id);
    };
    let mut result = output::read_output(&root, &path)?;
    result.kind = kind.into();
    Ok(result)
}

fn native_output(root: &Path, run_id: &str) -> Result<output::AutomationRunOutput, String> {
    let path = if run_id == "legacy" && !root.join("runs/legacy").exists() {
        root.join("output.log")
    } else {
        root.join("runs").join(run_id).join("output.log")
    };
    let mut result = output::read_output(root, &path)?;
    result.kind = "system".into();
    Ok(result)
}

#[cfg(test)]
mod tests;
