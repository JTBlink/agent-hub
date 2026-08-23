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
    pub backup_path: PathBuf,
}

#[derive(Debug, Error)]
pub enum LegacyCodexSkillError {
    #[error("只允许处理 ~/.codex/skills 下的 Skill 目录")]
    InvalidSource,
    #[error("~/.codex/skills/.system 下的 Skill 由 Codex 管理，无需迁移")]
    SystemSkill,
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
    let action_label = action.as_str();
    crate::logging::legacy_codex_action_started(action_label);
    let result = resolve_legacy_codex_skill_inner(
        home_directory,
        backup_root,
        source_path,
        action,
        action_label,
    );
    match &result {
        Ok(_) => crate::logging::legacy_codex_action_completed(action_label),
        Err(error) => crate::logging::legacy_codex_action_failed(action_label, error.code()),
    }
    result
}

impl LegacyCodexSkillAction {
    fn as_str(self) -> &'static str {
        match self {
            Self::Migrate => "migrate",
            Self::Archive => "archive",
        }
    }
}

impl LegacyCodexSkillError {
    fn code(&self) -> &'static str {
        match self {
            Self::InvalidSource => "invalid_source",
            Self::SystemSkill => "system_skill",
            Self::UnsafePath(_) => "unsafe_path",
            Self::PreferredTargetExists => "preferred_target_exists",
            Self::Io(_) => "io_error",
        }
    }
}

fn resolve_legacy_codex_skill_inner(
    home_directory: impl AsRef<Path>,
    backup_root: impl AsRef<Path>,
    source_path: impl AsRef<Path>,
    action: LegacyCodexSkillAction,
    action_label: &str,
) -> Result<LegacyCodexSkillResolution, LegacyCodexSkillError> {
    let home = home_directory.as_ref();
    let legacy_root = home.join(".codex/skills");
    let source_path = source_path.as_ref();
    let source_directory = skill_directory(source_path)?;
    let relative_path = source_directory
        .strip_prefix(&legacy_root)
        .map_err(|_| LegacyCodexSkillError::InvalidSource)?;
    if relative_path.as_os_str().is_empty()
        || relative_path
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err(LegacyCodexSkillError::InvalidSource);
    }
    if relative_path.components().next().is_some_and(|component| {
        matches!(
            component,
            std::path::Component::Normal(name) if name == std::ffi::OsStr::new(".system")
        )
    }) {
        return Err(LegacyCodexSkillError::SystemSkill);
    }
    let skill_name = source_directory
        .file_name()
        .filter(|name| !name.is_empty())
        .ok_or(LegacyCodexSkillError::InvalidSource)?;
    reject_symlinks(source_directory)?;
    if !source_directory.join(SKILL_FILE).is_file() {
        return Err(LegacyCodexSkillError::InvalidSource);
    }
    crate::logging::legacy_codex_phase(action_label, "validated");

    let backup_path = archive_target(backup_root.as_ref(), skill_name)?;
    let destination = match action {
        LegacyCodexSkillAction::Migrate => {
            let target = migration_target(home, relative_path)?;
            crate::logging::legacy_codex_phase(action_label, "target_checked");
            crate::logging::legacy_codex_phase(action_label, "backup_started");
            copy_directory(source_directory, &backup_path)?;
            crate::logging::legacy_codex_phase(action_label, "backup_completed");
            crate::logging::legacy_codex_phase(action_label, "move_started");
            fs::rename(source_directory, &target)?;
            crate::logging::legacy_codex_phase(action_label, "move_completed");
            target
        }
        LegacyCodexSkillAction::Archive => {
            crate::logging::legacy_codex_phase(action_label, "archive_started");
            fs::rename(source_directory, &backup_path)?;
            crate::logging::legacy_codex_phase(action_label, "archive_completed");
            backup_path.clone()
        }
    };
    Ok(LegacyCodexSkillResolution {
        action,
        original_path: source_directory.to_path_buf(),
        destination_path: destination,
        backup_path,
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

fn migration_target(home: &Path, relative_path: &Path) -> Result<PathBuf, LegacyCodexSkillError> {
    let preferred_root = home.join(".agents/skills");
    ensure_real_directory(&preferred_root)?;
    let target = preferred_root.join(relative_path);
    if let Some(parent) = target.parent() {
        ensure_real_directory(parent)?;
    }
    if fs::symlink_metadata(&target).is_ok() {
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

fn copy_directory(source: &Path, destination: &Path) -> Result<(), LegacyCodexSkillError> {
    fs::create_dir(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = destination.join(entry.file_name());
        let metadata = fs::symlink_metadata(&source_path)?;
        if metadata.file_type().is_symlink() {
            return Err(LegacyCodexSkillError::UnsafePath(source_path));
        }
        if metadata.is_dir() {
            copy_directory(&source_path, &target_path)?;
        } else if metadata.is_file() {
            fs::copy(source_path, target_path)?;
        }
    }
    Ok(())
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
