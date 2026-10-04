//! Host configuration and workspace commands; Skills are managed by the independent module.

use super::*;

#[tauri::command]
pub(super) fn preview_config_edit(
    state: tauri::State<'_, AppState>,
    path: String,
    format: ConfigFormat,
    replacement: String,
) -> Result<configuration::ConfigEditPreview, String> {
    let authorization = state.authorization(Path::new(&path))?;
    if authorization.format != format {
        return Err("configuration format does not match the discovered file".into());
    }
    configuration::preview(path, format, replacement.as_bytes()).map_err(|error| {
        logging::command_failed(
            logging::Command::PreviewConfigEdit,
            logging::FailureCode::Configuration,
        );
        error.to_string()
    })
}

#[tauri::command]
pub(super) fn read_config_source(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    state.authorization(Path::new(&path))?;
    std::fs::read_to_string(path).map_err(|_| {
        logging::command_failed(
            logging::Command::ReadConfigSource,
            logging::FailureCode::Configuration,
        );
        "could not read the authorized configuration source".into()
    })
}

#[tauri::command]
pub(super) fn open_directory_in_editor(path: String) -> Result<bool, String> {
    let requested = PathBuf::from(path);
    let directory = match std::fs::metadata(&requested) {
        Ok(metadata) if metadata.is_file() => requested
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "无法确定目录位置".to_owned())?,
        Ok(_) => requested,
        Err(_) => return Err("目录不存在或无法读取".to_owned()),
    };

    if ProcessCommand::new("code")
        .arg("--reuse-window")
        .arg(&directory)
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
    {
        return Ok(true);
    }

    #[cfg(target_os = "windows")]
    if ProcessCommand::new("code.cmd")
        .arg("--reuse-window")
        .arg(&directory)
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
    {
        return Ok(true);
    }

    #[cfg(target_os = "macos")]
    if ProcessCommand::new("open")
        .args(["-a", "Visual Studio Code"])
        .arg(&directory)
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
    {
        return Ok(true);
    }

    #[cfg(target_os = "windows")]
    let fallback = ProcessCommand::new("explorer").arg(&directory).status();

    #[cfg(target_os = "macos")]
    let fallback = ProcessCommand::new("open").arg(&directory).status();

    #[cfg(all(unix, not(target_os = "macos")))]
    let fallback = ProcessCommand::new("xdg-open").arg(&directory).status();

    fallback
        .map(|status| status.success())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(super) fn write_config(
    state: tauri::State<'_, AppState>,
    path: String,
    format: ConfigFormat,
    expected_checksum: String,
    replacement: String,
) -> Result<configuration::ConfigWriteResult, String> {
    write_config_for_state(&state, &path, format, &expected_checksum, &replacement)
}

pub(super) fn write_config_for_state(
    state: &AppState,
    path: &str,
    format: ConfigFormat,
    expected_checksum: &str,
    replacement: &str,
) -> Result<configuration::ConfigWriteResult, String> {
    let authorization = state.authorization(Path::new(path))?;
    if authorization.format != format {
        return Err("configuration format does not match the discovered file".into());
    }
    let backup_root = state.backup_root.join(authorization.id.to_string());
    let result = configuration::write_atomically(
        Path::new(path),
        format,
        expected_checksum,
        replacement.as_bytes(),
        &backup_root,
    )
    .map_err(|error| {
        logging::command_failed(
            logging::Command::WriteConfig,
            logging::FailureCode::Configuration,
        );
        error.to_string()
    })?;
    record_config_change_or_restore(
        state,
        authorization.id,
        "edit",
        &result,
        Path::new(path),
        format,
        &backup_root,
    )
    .inspect_err(|_| {
        logging::command_failed(
            logging::Command::WriteConfig,
            logging::FailureCode::Persistence,
        );
    })?;
    Ok(result)
}

#[tauri::command]
pub(super) fn rollback_config(
    state: tauri::State<'_, AppState>,
    path: String,
    format: ConfigFormat,
    expected_checksum: String,
    backup_path: String,
) -> Result<configuration::ConfigWriteResult, String> {
    let authorization = state.authorization(Path::new(&path))?;
    if authorization.format != format {
        return Err("configuration format does not match the discovered file".into());
    }
    let backup_is_known = state
        .config_metadata
        .config_history(Some(&path))
        .map_err(|error| error.to_string())?
        .iter()
        .any(|entry| entry.backup_path == backup_path);
    if !backup_is_known {
        return Err("configuration backup is not part of this file's history".into());
    }
    let destination_backup_root = state.backup_root.join(authorization.id.to_string());
    let result = configuration::rollback_with_destination(
        Path::new(&path),
        format,
        &expected_checksum,
        &backup_path,
        &state.backup_root,
        &destination_backup_root,
    )
    .map_err(|error| {
        logging::command_failed(
            logging::Command::RollbackConfig,
            logging::FailureCode::Configuration,
        );
        error.to_string()
    })?;
    record_config_change_or_restore(
        &state,
        authorization.id,
        "rollback",
        &result,
        Path::new(&path),
        format,
        &destination_backup_root,
    )
    .inspect_err(|_| {
        logging::command_failed(
            logging::Command::RollbackConfig,
            logging::FailureCode::Persistence,
        );
    })?;
    Ok(result)
}

pub(super) fn record_config_change(
    state: &AppState,
    config_file_id: i64,
    operation_type: &str,
    result: &configuration::ConfigWriteResult,
) -> Result<i64, persistence::PersistenceError> {
    state.config_metadata.record_config_change(
        &persistence::NewConfigBackup {
            config_file_id: Some(config_file_id),
            backup_path: result.backup_path.to_string_lossy().into_owned(),
            original_checksum: result.before.checksum.clone(),
            operation_type: operation_type.into(),
        },
        &persistence::NewConfigOperation {
            config_file_id: Some(config_file_id),
            operation_type: operation_type.into(),
            before_checksum: Some(result.before.checksum.clone()),
            after_checksum: Some(result.after.checksum.clone()),
            backup_id: None,
            result: "succeeded".into(),
            diagnostic_code: None,
        },
    )
}

pub(super) fn record_config_change_or_restore(
    state: &AppState,
    config_file_id: i64,
    operation_type: &str,
    result: &configuration::ConfigWriteResult,
    path: &Path,
    format: ConfigFormat,
    backup_root: &Path,
) -> Result<(), String> {
    if let Err(metadata_error) = record_config_change(state, config_file_id, operation_type, result)
    {
        return match configuration::rollback(
            path,
            format,
            &result.after.checksum,
            &result.backup_path,
            backup_root,
        ) {
            Ok(_) => Err(format!(
                "history could not be recorded; the configuration was restored: {metadata_error}"
            )),
            Err(restore_error) => Err(format!(
                "configuration changed, but history recording and compensation both failed: history={metadata_error}; compensation={restore_error}"
            )),
        };
    }
    Ok(())
}

#[tauri::command]
pub(super) fn list_config_history(
    state: tauri::State<'_, AppState>,
    path: Option<String>,
) -> Result<Vec<persistence::ConfigHistoryRecord>, String> {
    if let Some(path) = path.as_deref() {
        state.authorization(Path::new(path))?;
    }
    state
        .config_metadata
        .config_history(path.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(super) fn get_config_history_entry(
    state: tauri::State<'_, AppState>,
    operation_id: i64,
) -> Result<Option<persistence::ConfigHistoryRecord>, String> {
    let entry = state
        .config_metadata
        .config_history_entry(operation_id)
        .map_err(|error| error.to_string())?;
    if let Some(entry) = &entry {
        state.authorization(Path::new(&entry.path))?;
    }
    Ok(entry)
}

pub(super) fn authorized_history_entry(
    state: &AppState,
    operation_id: i64,
) -> Result<(persistence::ConfigHistoryRecord, AuthorizedConfig), String> {
    let entry = state
        .config_metadata
        .config_history_entry(operation_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "configuration history entry does not exist".to_owned())?;
    let authorization = state.authorization(Path::new(&entry.path))?;
    if entry
        .config_file_id
        .is_some_and(|config_file_id| config_file_id != authorization.id)
        || authorization.format != entry.format
    {
        return Err("configuration history no longer matches the discovered file".into());
    }
    Ok((entry, authorization))
}

#[tauri::command]
pub(super) fn preview_config_restore(
    state: tauri::State<'_, AppState>,
    operation_id: i64,
) -> Result<configuration::ConfigEditPreview, String> {
    let (entry, _authorization) = authorized_history_entry(&state, operation_id)?;
    configuration::preview_rollback(
        &entry.path,
        entry.format,
        &entry.backup_path,
        &state.backup_root,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub(super) fn restore_config_history(
    state: tauri::State<'_, AppState>,
    operation_id: i64,
    expected_checksum: String,
) -> Result<configuration::ConfigWriteResult, String> {
    let (entry, authorization) = authorized_history_entry(&state, operation_id)?;
    let destination_backup_root = state.backup_root.join(authorization.id.to_string());
    let result = configuration::rollback_with_destination(
        &entry.path,
        entry.format,
        &expected_checksum,
        &entry.backup_path,
        &state.backup_root,
        &destination_backup_root,
    )
    .map_err(|error| error.to_string())?;
    record_config_change_or_restore(
        &state,
        authorization.id,
        "rollback",
        &result,
        Path::new(&entry.path),
        entry.format,
        &destination_backup_root,
    )?;
    Ok(result)
}
