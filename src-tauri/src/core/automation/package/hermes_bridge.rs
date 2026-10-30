//! Hermes accepts scripts only under its own profile. Small real Python entry
//! files forward to a task's private environment; no symlink escapes are used.
use super::*;
use std::fs;

fn home(record: &ManagedAutomation) -> Result<PathBuf, String> {
    let location = Path::new(&record.location);
    if !location.is_absolute() || !location.ends_with("cron/jobs.json") {
        return Err("Hermes profile binding is invalid".into());
    }
    super::super::hermes_manage::root_for(&super::registration::task(record))
}

pub(super) fn prepare(state: &Path, record: &ManagedAutomation) -> Result<Vec<String>, String> {
    let package = checked(state, record)?;
    let manifest: Manifest = super::storage::json(&package.join("task.json"))?;
    let Some(options) = manifest.hermes else {
        return Ok(Vec::new());
    };
    let root = home(record)?;
    let help = super::super::hermes_manage::invoke(
        &root,
        &["cron".into(), "create".into(), "--help".into()],
    )?;
    if (options.script.is_some() && !help.contains("--script"))
        || (options.monitor_script.is_some() && !help.contains("--monitor-script"))
        || (options.no_agent && !help.contains("--no-agent"))
    {
        return Err("Installed Hermes CLI does not support this task's script options".into());
    }
    let scripts = root.join("scripts");
    if !scripts.exists() {
        fs::create_dir(&scripts).map_err(|e| e.to_string())?;
    }
    super::storage::regular_directory(&scripts)?;
    let directory = scripts.join(format!(
        "agent-hub-{}",
        record.id.trim_start_matches("agent_hub:")
    ));
    if directory.exists() {
        super::storage::regular_directory(&directory)?;
        let owner: String = super::storage::json(&directory.join("owner.json"))?;
        if owner != record.id {
            return Err("Hermes bridge belongs to another task".into());
        }
    } else {
        fs::create_dir(&directory).map_err(|e| e.to_string())?;
        json_write(&directory.join("owner.json"), &record.id)?;
    }
    // Profile and exact paths are durable before any bridge or job registration.
    json_write(&package.join(".local/hermes-bridge.json"), &directory)?;
    let mut args = Vec::new();
    for (flag, source, name) in [
        ("--script", options.script, "script.py"),
        ("--monitor-script", options.monitor_script, "monitor.py"),
    ] {
        if let Some(relative) = source {
            super::exchange::validate_path(&relative)?;
            if !record.draft.files.iter().any(|f| f.path == relative) {
                return Err("Hermes bridge source is not declared in the package".into());
            }
            let target = super::super::native::bundle_files::path(
                &package.to_string_lossy(),
                &relative,
                false,
            )?;
            let interpreter = if relative.ends_with(".sh") {
                PathBuf::from("/bin/bash")
            } else if relative.ends_with(".ps1") {
                return Err("Hermes script bridges currently support .py and .sh files".into());
            } else if relative.ends_with(".py") {
                fs::read_to_string(package.join(".local/python-path"))
                    .map(|p| PathBuf::from(p.trim()))
                    .or_else(|_| super::super::native::python_runtime())?
            } else {
                return Err("Hermes scripts require .py or .sh entries".into());
            };
            let literal =
                |p: &Path| serde_json::to_string(&p.to_string_lossy()).map_err(|e| e.to_string());
            let cwd = record
                .draft
                .workdir
                .as_ref()
                .map(PathBuf::from)
                .unwrap_or_else(|| package.clone());
            let content = format!("import os\nos.environ['AGENT_HUB_TASK_DIR'] = {}\nos.environ['AGENT_HUB_SCRIPT_DIR'] = {}\nos.environ['AGENT_HUB_STATE_DIR'] = {}\nos.makedirs(os.environ['AGENT_HUB_STATE_DIR'], exist_ok=True)\nos.chdir({})\nos.execv({}, [{}, {}])\n",
                literal(&package)?, literal(&package)?, literal(&package.join(".local/state"))?, literal(&cwd)?, literal(&interpreter)?, literal(&interpreter)?, literal(&target)?);
            let bridge = directory.join(name);
            if bridge.is_symlink() {
                return Err("Hermes bridge entry cannot be a link".into());
            }
            store::write(&bridge, content.as_bytes())?;
            args.push(format!(
                "{flag}={}",
                bridge
                    .strip_prefix(&scripts)
                    .map_err(|e| e.to_string())?
                    .to_string_lossy()
            ));
        }
    }
    if options.no_agent {
        args.push("--no-agent".into());
    }
    Ok(args)
}

pub(super) fn cleanup(record: &ManagedAutomation) -> Result<(), String> {
    let package = directory(record).ok_or("Missing task package")?;
    let receipt = package.join(".local/hermes-bridge.json");
    if !receipt.exists() {
        return Ok(());
    }
    let path: PathBuf = super::storage::json(&receipt)?;
    let expected = home(record)?.join("scripts").join(format!(
        "agent-hub-{}",
        record.id.trim_start_matches("agent_hub:")
    ));
    if path != expected {
        return Err("Hermes bridge receipt changed; files were preserved".into());
    }
    if path.exists() {
        super::storage::regular_directory(&path)?;
        let owner: String = super::storage::json(&path.join("owner.json"))?;
        if owner != record.id {
            return Err("Hermes bridge ownership changed".into());
        }
        for entry in fs::read_dir(&path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if !["owner.json", "script.py", "monitor.py"]
                .iter()
                .any(|n| entry.file_name() == *n)
            {
                return Err("Hermes bridge contains additional files; files were preserved".into());
            }
        }
        fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    }
    fs::remove_file(receipt).map_err(|e| e.to_string())
}
