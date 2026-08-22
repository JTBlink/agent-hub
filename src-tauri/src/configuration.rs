//! Safe, format-aware configuration file editing.
//!
//! This module is deliberately independent from Tauri and SQLite.  It provides the
//! deep file-system seam used by every Agent adapter: optimistic revision checks,
//! private backups, same-directory temporary files and atomic replacement.

use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::ConfigFormat;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigRevision {
    pub checksum: String,
    pub byte_size: u64,
    pub modified_at_ms: Option<u128>,
    #[cfg(unix)]
    pub file_id: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigEditPreview {
    pub path: PathBuf,
    pub before: ConfigRevision,
    pub after_checksum: String,
    pub changed: bool,
    pub diff: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigWriteResult {
    pub path: PathBuf,
    pub before: ConfigRevision,
    pub after: ConfigRevision,
    pub backup_path: PathBuf,
}

#[derive(Debug, Error)]
pub enum ConfigurationError {
    #[error("configuration file I/O failed: {0}")]
    Io(#[from] io::Error),
    #[error("configuration file is not valid UTF-8")]
    InvalidUtf8,
    #[error("configuration JSON is invalid at line {line}, column {column}")]
    InvalidJson { line: usize, column: usize },
    #[error("configuration file changed externally; reload it before saving")]
    ExternalModified { expected: String, actual: String },
    #[error("configuration backup path is outside the application backup directory")]
    UnsafeBackupPath,
    #[error("configuration target is a symbolic link or has multiple hard links")]
    UnsafeTarget,
    #[error("configuration write verification failed")]
    VerificationFailed,
}

/// Read a file and calculate the optimistic-lock revision used by preview/write.
pub fn read_revision(
    path: impl AsRef<Path>,
) -> Result<(Vec<u8>, ConfigRevision), ConfigurationError> {
    let path = path.as_ref();
    let bytes = fs::read(path)?;
    let metadata = fs::metadata(path)?;
    let modified_at_ms = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis());

    Ok((
        bytes.clone(),
        ConfigRevision {
            checksum: checksum(&bytes),
            byte_size: bytes.len() as u64,
            modified_at_ms,
            #[cfg(unix)]
            file_id: file_id(&metadata),
        },
    ))
}

/// Validate edited bytes without rewriting or normalising their source shape.
pub fn validate(format: ConfigFormat, bytes: &[u8]) -> Result<(), ConfigurationError> {
    let source = std::str::from_utf8(bytes).map_err(|_| ConfigurationError::InvalidUtf8)?;
    match format {
        ConfigFormat::Json => {
            serde_json::from_str::<serde_json::Value>(source).map_err(|error| {
                ConfigurationError::InvalidJson {
                    line: error.line(),
                    column: error.column(),
                }
            })?;
        }
        ConfigFormat::Jsonc => {
            parse_jsonc_value(source).map_err(|message| {
                ConfigurationError::Io(io::Error::new(io::ErrorKind::InvalidData, message))
            })?;
        }
        ConfigFormat::Toml => {
            source.parse::<toml::Value>().map_err(|error| {
                ConfigurationError::Io(io::Error::new(
                    io::ErrorKind::InvalidData,
                    error.to_string(),
                ))
            })?;
        }
        ConfigFormat::Yaml | ConfigFormat::Markdown => {}
    }
    Ok(())
}

/// Produce a preview.  The caller must show this diff and obtain confirmation before write.
pub fn preview(
    path: impl AsRef<Path>,
    format: ConfigFormat,
    replacement: &[u8],
) -> Result<ConfigEditPreview, ConfigurationError> {
    let path = path.as_ref().to_path_buf();
    let (current, before) = read_revision(&path)?;
    validate(format, replacement)?;
    let before_display = redact_source_for_display(&current);
    let after_display = redact_source_for_display(replacement);
    let mut diff = unified_diff(before_display.as_bytes(), after_display.as_bytes());
    if current != replacement && diff.is_empty() {
        diff =
            "--- current\n+++ proposed\n~ sensitive values changed (•••••• redacted)\n".to_owned();
    }
    Ok(ConfigEditPreview {
        path,
        before,
        after_checksum: checksum(replacement),
        changed: current != replacement,
        diff,
    })
}

/// Back up and atomically replace a file if its checksum still equals `expected_checksum`.
pub fn write_atomically(
    path: impl AsRef<Path>,
    format: ConfigFormat,
    expected_checksum: &str,
    replacement: &[u8],
    backup_root: impl AsRef<Path>,
) -> Result<ConfigWriteResult, ConfigurationError> {
    let path = path.as_ref().to_path_buf();
    validate_write_target(&path)?;
    validate(format, replacement)?;
    let (current, before) = read_revision(&path)?;
    if before.checksum != expected_checksum {
        return Err(ConfigurationError::ExternalModified {
            expected: expected_checksum.to_owned(),
            actual: before.checksum,
        });
    }

    let backup_root = backup_root.as_ref();
    fs::create_dir_all(backup_root)?;
    set_private_directory(backup_root)?;
    let backup_path = write_private_backup(backup_root, &current, &before.checksum)?;

    let metadata = fs::metadata(&path)?;
    let temporary_path = create_temporary_file(&path, replacement, &metadata)?;
    let (_, latest) = read_revision(&path)?;
    if latest.checksum != expected_checksum {
        let _ = fs::remove_file(&temporary_path);
        return Err(ConfigurationError::ExternalModified {
            expected: expected_checksum.to_owned(),
            actual: latest.checksum,
        });
    }
    let rename_result = atomic_replace(&temporary_path, &path);
    if let Err(error) = rename_result {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }

    let (_, after) = read_revision(&path)?;
    if after.checksum != checksum(replacement) {
        let _ = restore_backup(&backup_path, &path);
        return Err(ConfigurationError::VerificationFailed);
    }

    // Keep the compiler honest that `current` is intentionally read before the second
    // revision check; it is also useful to callers through the returned `before` value.
    debug_assert_eq!(checksum(&current), before.checksum);
    Ok(ConfigWriteResult {
        path,
        before,
        after,
        backup_path,
    })
}

/// Restore a backup after checking that the target has not changed since confirmation.
pub fn rollback(
    path: impl AsRef<Path>,
    format: ConfigFormat,
    expected_current_checksum: &str,
    backup_path: impl AsRef<Path>,
    backup_root: impl AsRef<Path>,
) -> Result<ConfigWriteResult, ConfigurationError> {
    let backup_root = fs::canonicalize(backup_root.as_ref())?;
    let backup_path = fs::canonicalize(backup_path.as_ref())?;
    if !backup_path.starts_with(&backup_root) || !backup_path.is_file() {
        return Err(ConfigurationError::UnsafeBackupPath);
    }
    let replacement = fs::read(&backup_path)?;
    write_atomically(
        path,
        format,
        expected_current_checksum,
        &replacement,
        &backup_root,
    )
}

fn checksum(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub(crate) fn parse_jsonc_value(source: &str) -> Result<serde_json::Value, String> {
    let mut stripped = Vec::with_capacity(source.len());
    let bytes = source.as_bytes();
    let mut index = 0;
    let mut in_string = false;
    let mut escaped = false;
    while index < bytes.len() {
        let byte = bytes[index];
        if byte == b'"' && !escaped {
            in_string = !in_string;
        }
        if !in_string && bytes.get(index..index + 2) == Some(b"//") {
            while index < bytes.len() && bytes[index] != b'\n' {
                index += 1;
            }
            continue;
        }
        if !in_string && bytes.get(index..index + 2) == Some(b"/*") {
            index += 2;
            while index + 1 < bytes.len() && bytes.get(index..index + 2) != Some(b"*/") {
                index += 1;
            }
            index = (index + 2).min(bytes.len());
            continue;
        }
        stripped.push(byte);
        escaped = in_string && byte == b'\\' && !escaped;
        if byte != b'\\' {
            escaped = false;
        }
        index += 1;
    }
    let mut normalized = Vec::with_capacity(stripped.len());
    for (position, byte) in stripped.iter().enumerate() {
        if *byte == b','
            && stripped[position + 1..]
                .iter()
                .find(|next| !next.is_ascii_whitespace())
                .is_some_and(|next| matches!(next, b'}' | b']'))
        {
            continue;
        }
        normalized.push(*byte);
    }
    let normalized = String::from_utf8(normalized).map_err(|_| "invalid UTF-8".to_owned())?;
    serde_json::from_str(&normalized).map_err(|error| error.to_string())
}

fn timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn create_temporary_file(
    path: &Path,
    bytes: &[u8],
    original_metadata: &fs::Metadata,
) -> Result<PathBuf, ConfigurationError> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    for attempt in 0..100u32 {
        let candidate = parent.join(format!(
            ".{}.agent-hub-{}.tmp",
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("config"),
            attempt
        ));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(mut file) => {
                set_file_permissions(&file, original_metadata)?;
                file.write_all(bytes)?;
                file.flush()?;
                file.sync_all()?;
                return Ok(candidate);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }
    Err(ConfigurationError::Io(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "could not allocate a temporary configuration file",
    )))
}

fn write_private_backup(
    root: &Path,
    bytes: &[u8],
    source_checksum: &str,
) -> Result<PathBuf, ConfigurationError> {
    let base = format!(
        "{}-{}",
        timestamp_ms(),
        &source_checksum[..12.min(source_checksum.len())]
    );
    for attempt in 0..100u32 {
        let suffix = if attempt == 0 {
            String::new()
        } else {
            format!("-{attempt}")
        };
        let path = root.join(format!("{base}{suffix}"));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                set_private_file(&file)?;
                file.write_all(bytes)?;
                file.flush()?;
                file.sync_all()?;
                return Ok(path);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }
    Err(ConfigurationError::Io(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "could not allocate a configuration backup file",
    )))
}

fn restore_backup(source: &Path, target: &Path) -> Result<(), ConfigurationError> {
    let metadata = fs::metadata(target)?;
    let replacement = fs::read(source)?;
    let temporary = create_temporary_file(target, &replacement, &metadata)?;
    atomic_replace(&temporary, target)
}

fn atomic_replace(source: &Path, target: &Path) -> Result<(), ConfigurationError> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{ReplaceFileW, REPLACEFILE_WRITE_THROUGH};

        let source = source
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let target = target
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let moved = unsafe {
            ReplaceFileW(
                target.as_ptr(),
                source.as_ptr(),
                std::ptr::null(),
                REPLACEFILE_WRITE_THROUGH,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        if moved == 0 {
            return Err(io::Error::last_os_error().into());
        }
    }

    #[cfg(not(windows))]
    fs::rename(source, target)?;
    if let Some(parent) = target.parent() {
        if let Ok(directory) = File::open(parent) {
            let _ = directory.sync_all();
        }
    }
    Ok(())
}

fn validate_write_target(path: &Path) -> Result<(), ConfigurationError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(ConfigurationError::UnsafeTarget);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.nlink() > 1 {
            return Err(ConfigurationError::UnsafeTarget);
        }
    }
    Ok(())
}

#[cfg(unix)]
fn file_id(metadata: &fs::Metadata) -> Option<u64> {
    use std::os::unix::fs::MetadataExt;
    Some(metadata.ino())
}

#[cfg(not(unix))]
fn file_id(_: &fs::Metadata) -> Option<u64> {
    None
}

#[cfg(unix)]
fn set_private_directory(path: &Path) -> Result<(), ConfigurationError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    Ok(())
}

#[cfg(not(unix))]
fn set_private_directory(_: &Path) -> Result<(), ConfigurationError> {
    Ok(())
}

fn set_private_file(file: &File) -> Result<(), ConfigurationError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

fn set_file_permissions(
    file: &File,
    original_metadata: &fs::Metadata,
) -> Result<(), ConfigurationError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        file.set_permissions(fs::Permissions::from_mode(original_metadata.mode() & 0o777))?;
    }
    #[cfg(not(unix))]
    {
        let _ = original_metadata;
        set_private_file(file)?;
    }
    Ok(())
}

fn unified_diff(before: &[u8], after: &[u8]) -> String {
    if before == after {
        return String::new();
    }
    let before = String::from_utf8_lossy(before);
    let after = String::from_utf8_lossy(after);
    let mut diff = String::from("--- current\n+++ proposed\n");
    for line in before.lines() {
        diff.push('-');
        diff.push_str(line);
        diff.push('\n');
    }
    for line in after.lines() {
        diff.push('+');
        diff.push_str(line);
        diff.push('\n');
    }
    diff
}

pub(crate) fn redact_source_for_display(bytes: &[u8]) -> String {
    static SENSITIVE_JSON_VALUE: OnceLock<regex::Regex> = OnceLock::new();
    let source = String::from_utf8_lossy(bytes);
    let pattern = SENSITIVE_JSON_VALUE.get_or_init(|| {
        regex::Regex::new(
            r#"(?i)(["']?(?:api[_-]?key|token|secret|password|credential|authorization|cookie|private[_-]?key)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|[^,\s}\]\r\n]+)"#,
        )
        .expect("sensitive configuration pattern is valid")
    });
    pattern.replace_all(&source, "$1\"••••••\"").into_owned()
}

pub(crate) fn redact_sensitive_values(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, value) in map {
                let normalized = key
                    .chars()
                    .filter(|character| character.is_ascii_alphanumeric())
                    .flat_map(char::to_lowercase)
                    .collect::<String>();
                if [
                    "apikey",
                    "token",
                    "secret",
                    "password",
                    "credential",
                    "authorization",
                    "cookie",
                    "privatekey",
                ]
                .iter()
                .any(|marker| normalized.contains(marker))
                {
                    *value = serde_json::Value::String("••••••".to_owned());
                } else {
                    redact_sensitive_values(value);
                }
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                redact_sensitive_values(value);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn preview_validates_json_and_reports_a_diff_without_writing() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("settings.json");
        fs::write(&path, br#"{"model":"sonnet"}"#).expect("fixture");

        let preview =
            preview(&path, ConfigFormat::Json, br#"{"model":"opus"}"#).expect("preview succeeds");
        assert!(preview.changed);
        assert!(preview.diff.contains("-{"));
        assert_eq!(
            fs::read(&path).expect("source remains"),
            br#"{"model":"sonnet"}"#
        );
    }

    #[test]
    fn preview_redacts_sensitive_values_from_the_diff() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("settings.json");
        fs::write(&path, br#"{"apiKey":"old-secret"}"#).expect("fixture");

        let preview = preview(&path, ConfigFormat::Json, br#"{"apiKey":"new-secret"}"#)
            .expect("preview succeeds");
        assert!(!preview.diff.contains("old-secret"));
        assert!(!preview.diff.contains("new-secret"));
        assert!(preview.diff.contains("••••••"));
    }

    #[test]
    fn write_creates_private_backup_and_rejects_external_changes() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("settings.json");
        let backup_root = directory.path().join("backups");
        fs::write(&path, b"one\n").expect("fixture");
        let (_, revision) = read_revision(&path).expect("revision");
        fs::write(&path, b"changed\n").expect("external change");

        let error = write_atomically(
            &path,
            ConfigFormat::Json,
            &revision.checksum,
            br#"{"value":"two"}"#,
            &backup_root,
        )
        .expect_err("external change is rejected");
        assert!(matches!(error, ConfigurationError::ExternalModified { .. }));

        let (_, revision) = read_revision(&path).expect("new revision");
        let result = write_atomically(
            &path,
            ConfigFormat::Json,
            &revision.checksum,
            br#"{"value":"two"}"#,
            &backup_root,
        )
        .expect("write succeeds");
        assert_eq!(
            fs::read(&path).expect("written file"),
            br#"{"value":"two"}"#
        );
        assert_eq!(fs::read(&result.backup_path).expect("backup"), b"changed\n");
        assert!(result.backup_path.starts_with(&backup_root));
    }

    #[test]
    fn rollback_restores_backup_and_creates_a_backup_of_current_content() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("settings.json");
        let backup_root = directory.path().join("backups");
        fs::write(&path, b"before\n").expect("fixture");
        let (_, revision) = read_revision(&path).expect("revision");
        let write = write_atomically(
            &path,
            ConfigFormat::Markdown,
            &revision.checksum,
            b"after\n",
            &backup_root,
        )
        .expect("write");
        let (_, current) = read_revision(&path).expect("current revision");
        rollback(
            &path,
            ConfigFormat::Markdown,
            &current.checksum,
            &write.backup_path,
            &backup_root,
        )
        .expect("rollback");
        assert_eq!(fs::read(&path).expect("restored file"), b"before\n");
    }
}
