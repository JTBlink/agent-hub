use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use thiserror::Error;

const SKILL_FILE: &str = "SKILL.md";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LegacyCodexSkillAction {
    Migrate,
    Archive,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyCodexSkillResolution {
    pub action: LegacyCodexSkillAction,
    pub original_path: PathBuf,
    pub destination_path: PathBuf,
}

#[derive(Debug, Error)]
pub enum LegacyCodexSkillError {
    #[error("只允许处理 ~/.codex/skills 下的直接 Skill 目录")]
    InvalidSource,
    #[error("Skill 目录包含符号链接，无法安全迁移或归档: {0}")]
    UnsafePath(PathBuf),
    #[error("~/.agents/skills 中已存在同名 Skill，请选择归档旧副本")]
    PreferredTargetExists,
    #[error("无法处理 Codex 旧目录: {0}")]
    Io(#[from] std::io::Error),
}

/// Move a Codex legacy global Skill to the preferred Agent Skills root, or
/// archive a redundant legacy copy under AgentHub's recoverable backup root.
pub fn resolve_legacy_codex_skill(
    home_directory: impl AsRef<Path>,
    backup_root: impl AsRef<Path>,
    source_path: impl AsRef<Path>,
    action: LegacyCodexSkillAction,
) -> Result<LegacyCodexSkillResolution, LegacyCodexSkillError> {
    let home = home_directory.as_ref();
    let legacy_root = home.join(".codex/skills");
    let source_path = source_path.as_ref();
    let source_directory = skill_directory(source_path)?;
    let skill_name = source_directory
        .file_name()
        .filter(|name| !name.is_empty())
        .ok_or(LegacyCodexSkillError::InvalidSource)?;
    if source_directory.parent() != Some(legacy_root.as_path()) {
        return Err(LegacyCodexSkillError::InvalidSource);
    }
    reject_symlinks(source_directory)?;
    if !source_directory.join(SKILL_FILE).is_file() {
        return Err(LegacyCodexSkillError::InvalidSource);
    }

    let destination = match action {
        LegacyCodexSkillAction::Migrate => migration_target(home, skill_name)?,
        LegacyCodexSkillAction::Archive => archive_target(backup_root.as_ref(), skill_name)?,
    };
    fs::rename(source_directory, &destination)?;
    Ok(LegacyCodexSkillResolution {
        action,
        original_path: source_directory.to_path_buf(),
        destination_path: destination,
    })
}

fn skill_directory(source_path: &Path) -> Result<&Path, LegacyCodexSkillError> {
    if source_path.file_name().and_then(|name| name.to_str()) == Some(SKILL_FILE) {
        source_path
            .parent()
            .ok_or(LegacyCodexSkillError::InvalidSource)
    } else {
        Ok(source_path)
    }
}

fn migration_target(
    home: &Path,
    skill_name: &std::ffi::OsStr,
) -> Result<PathBuf, LegacyCodexSkillError> {
    let preferred_root = home.join(".agents/skills");
    ensure_real_directory(&preferred_root)?;
    let target = preferred_root.join(skill_name);
    if target.exists() {
        return Err(LegacyCodexSkillError::PreferredTargetExists);
    }
    Ok(target)
}

fn archive_target(
    backup_root: &Path,
    skill_name: &std::ffi::OsStr,
) -> Result<PathBuf, LegacyCodexSkillError> {
    let archive_root = backup_root.join("legacy-codex-skills");
    ensure_real_directory(&archive_root)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    Ok(archive_root.join(format!("{timestamp}-{}", skill_name.to_string_lossy())))
}

fn ensure_real_directory(path: &Path) -> Result<(), LegacyCodexSkillError> {
    if !path.exists() {
        fs::create_dir_all(path)?;
    }
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(LegacyCodexSkillError::UnsafePath(path.to_path_buf()));
    }
    Ok(())
}

fn reject_symlinks(path: &Path) -> Result<(), LegacyCodexSkillError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(LegacyCodexSkillError::UnsafePath(path.to_path_buf()));
    }
    for entry in fs::read_dir(path)? {
        let child = entry?.path();
        let metadata = fs::symlink_metadata(&child)?;
        if metadata.file_type().is_symlink() {
            return Err(LegacyCodexSkillError::UnsafePath(child));
        }
        if metadata.is_dir() {
            reject_symlinks(&child)?;
        }
    }
    Ok(())
}
