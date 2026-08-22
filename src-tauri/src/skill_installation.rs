//! Staged, reversible Skill installation.

use std::{
    fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{skills::DiscoveredSkill, Agent, Scope};

const MARKER: &str = ".agent-hub-managed.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub skill_key: String,
    pub source_locator: String,
    pub source_revision: Option<String>,
    pub agent: Agent,
    pub scope: Scope,
    pub source_directory: PathBuf,
    pub target_directory: PathBuf,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedInstallation {
    pub skill_key: String,
    pub agent: Agent,
    pub scope: Scope,
    pub target_directory: PathBuf,
    pub files: Vec<String>,
    pub source_revision: Option<String>,
}

#[derive(Debug, Error)]
pub enum InstallationError {
    #[error("Skill source is unavailable: {0}")]
    SourceUnavailable(String),
    #[error("Skill target already exists and is not managed by AgentHub")]
    TargetExists,
    #[error("Skill path is unsafe: {0}")]
    UnsafePath(PathBuf),
    #[error("Skill installation I/O failed: {0}")]
    Io(#[from] io::Error),
    #[error("managed installation marker is invalid")]
    InvalidMarker,
}

pub fn plan_install(
    skill: &DiscoveredSkill,
    agent: Agent,
    scope: Scope,
    target_root: impl AsRef<Path>,
) -> Result<InstallPlan, InstallationError> {
    if !skill.installable {
        return Err(InstallationError::SourceUnavailable(
            "Skill has validation diagnostics".into(),
        ));
    }
    let source_entry = PathBuf::from(&skill.entrypoint_path);
    let source_directory = source_entry
        .parent()
        .ok_or_else(|| InstallationError::UnsafePath(source_entry.clone()))?
        .to_path_buf();
    let target_directory = target_root.as_ref().join(&skill.display_name);
    let mut files = Vec::new();
    collect_files(&source_directory, &source_directory, &mut files)?;
    files.sort();
    Ok(InstallPlan {
        skill_key: skill
            .name
            .clone()
            .unwrap_or_else(|| skill.display_name.clone()),
        source_locator: skill.source.locator.clone(),
        source_revision: skill.source.resolved_commit.clone(),
        agent,
        scope,
        source_directory,
        target_directory,
        files,
    })
}

pub fn apply_install(plan: &InstallPlan) -> Result<ManagedInstallation, InstallationError> {
    let existing = if plan.target_directory.exists() {
        let existing =
            read_marker(&plan.target_directory)?.ok_or(InstallationError::TargetExists)?;
        if existing.skill_key != plan.skill_key {
            return Err(InstallationError::TargetExists);
        }
        Some(existing)
    } else {
        None
    };
    let parent = plan
        .target_directory
        .parent()
        .ok_or_else(|| InstallationError::UnsafePath(plan.target_directory.clone()))?;
    fs::create_dir_all(parent)?;
    let staging = parent.join(format!(
        ".{}.agent-hub-staging-{}",
        plan.target_directory
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("skill"),
        timestamp_ms()
    ));
    fs::create_dir(&staging)?;
    let result = (|| {
        for relative in &plan.files {
            let source = safe_join(&plan.source_directory, relative)?;
            let target = safe_join(&staging, relative)?;
            let metadata = fs::symlink_metadata(&source)?;
            if !metadata.is_file() {
                return Err(InstallationError::UnsafePath(source));
            }
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(source, target)?;
        }
        let managed = ManagedInstallation {
            skill_key: plan.skill_key.clone(),
            agent: plan.agent,
            scope: plan.scope,
            target_directory: plan.target_directory.clone(),
            files: plan.files.clone(),
            source_revision: plan.source_revision.clone(),
        };
        fs::write(
            staging.join(MARKER),
            serde_json::to_vec_pretty(&managed).map_err(|error| {
                InstallationError::Io(io::Error::new(io::ErrorKind::InvalidData, error))
            })?,
        )?;
        let rollback_directory = parent.join(format!(
            ".{}.agent-hub-rollback-{}",
            plan.target_directory
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("skill"),
            timestamp_ms()
        ));
        if existing.is_some() {
            fs::rename(&plan.target_directory, &rollback_directory)?;
        }
        if let Err(error) = fs::rename(&staging, &plan.target_directory) {
            if existing.is_some() {
                let _ = fs::rename(&rollback_directory, &plan.target_directory);
            }
            return Err(error.into());
        }
        if existing.is_some() {
            fs::remove_dir_all(rollback_directory)?;
        }
        Ok(managed)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

pub fn set_enabled(
    target_directory: impl AsRef<Path>,
    enabled: bool,
) -> Result<ManagedInstallation, InstallationError> {
    let target_directory = target_directory.as_ref();
    let managed = read_marker(target_directory)?.ok_or(InstallationError::InvalidMarker)?;
    let enabled_entry = target_directory.join("SKILL.md");
    let disabled_entry = target_directory.join("SKILL.md.agent-hub-disabled");
    if enabled && disabled_entry.exists() {
        fs::rename(disabled_entry, enabled_entry)?;
    } else if !enabled && enabled_entry.exists() {
        fs::rename(enabled_entry, disabled_entry)?;
    }
    Ok(managed)
}

pub fn remove_installation(
    target_directory: impl AsRef<Path>,
) -> Result<ManagedInstallation, InstallationError> {
    let target_directory = target_directory.as_ref();
    let managed = read_marker(target_directory)?.ok_or(InstallationError::InvalidMarker)?;
    if managed.target_directory != target_directory {
        return Err(InstallationError::InvalidMarker);
    }
    fs::remove_dir_all(target_directory)?;
    Ok(managed)
}

fn collect_files(
    root: &Path,
    current: &Path,
    files: &mut Vec<String>,
) -> Result<(), InstallationError> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() {
            return Err(InstallationError::UnsafePath(path));
        }
        if metadata.is_dir() {
            collect_files(root, &path, files)?;
        } else if metadata.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|_| InstallationError::UnsafePath(path.clone()))?;
            files.push(relative.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(())
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, InstallationError> {
    let path = Path::new(relative);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(InstallationError::UnsafePath(path.to_path_buf()));
    }
    Ok(root.join(path))
}

fn read_marker(directory: &Path) -> Result<Option<ManagedInstallation>, InstallationError> {
    let marker = directory.join(MARKER);
    if !marker.exists() {
        return Ok(None);
    }
    let bytes = fs::read(marker)?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| InstallationError::InvalidMarker)
}

fn timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skills::{SourceKind, SourceMetadata};
    use tempfile::tempdir;

    fn fixture_skill(root: &Path) -> DiscoveredSkill {
        let directory = root.join("review");
        fs::create_dir_all(directory.join("references")).expect("skill directory");
        fs::write(
            directory.join("SKILL.md"),
            "---\nname: review\ndescription: Review changes\n---\n# Review\n",
        )
        .expect("entrypoint");
        fs::write(directory.join("references/guide.md"), "guide").expect("reference");
        DiscoveredSkill {
            source: SourceMetadata {
                kind: SourceKind::Local,
                locator: root.to_string_lossy().into_owned(),
                manifest_path: None,
                requested_ref: None,
                resolved_commit: Some("0123456789abcdef".into()),
            },
            relative_path: "review".into(),
            entrypoint_path: directory.join("SKILL.md").to_string_lossy().into_owned(),
            display_name: "review".into(),
            name: Some("review".into()),
            description: Some("Review changes".into()),
            license: None,
            compatibility: None,
            metadata: Default::default(),
            raw_frontmatter: None,
            installable: true,
            diagnostics: Vec::new(),
        }
    }

    #[test]
    fn install_is_staged_marked_and_reversible() {
        let source = tempdir().expect("source");
        let target = tempdir().expect("target");
        let skill = fixture_skill(source.path());
        let plan =
            plan_install(&skill, Agent::ClaudeCode, Scope::Global, target.path()).expect("plan");
        assert_eq!(plan.files, ["SKILL.md", "references/guide.md"]);
        let installation = apply_install(&plan).expect("install");
        assert!(installation.target_directory.join("SKILL.md").is_file());
        set_enabled(&installation.target_directory, false).expect("disable");
        assert!(installation
            .target_directory
            .join("SKILL.md.agent-hub-disabled")
            .is_file());
        set_enabled(&installation.target_directory, true).expect("enable");
        remove_installation(&installation.target_directory).expect("remove");
        assert!(!installation.target_directory.exists());
    }

    #[test]
    fn existing_unmanaged_target_is_never_overwritten() {
        let source = tempdir().expect("source");
        let target = tempdir().expect("target");
        let skill = fixture_skill(source.path());
        let plan =
            plan_install(&skill, Agent::ClaudeCode, Scope::Global, target.path()).expect("plan");
        fs::create_dir_all(&plan.target_directory).expect("existing target");
        fs::write(plan.target_directory.join("user-file"), "keep").expect("user file");
        assert!(matches!(
            apply_install(&plan),
            Err(InstallationError::TargetExists)
        ));
        assert!(plan.target_directory.join("user-file").exists());
    }
}
