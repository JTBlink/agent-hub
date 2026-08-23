//! Staged, reversible Skill installation.

use std::{
    convert::Infallible,
    fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::{
    persistence::{NewSkillDescriptor, NewSkillInstallation, NewSkillSource, SkillRepository},
    skills::{DiscoveredSkill, SourceKind},
    Agent, InstallationState, Scope, SkillKind,
};

const MARKER: &str = ".agent-hub-managed.json";
const MAX_INSTALL_FILES: usize = 10_000;
const MAX_INSTALL_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub skill_key: String,
    pub source_kind: SourceKind,
    pub source_locator: String,
    pub source_revision: Option<String>,
    pub source_fingerprint: String,
    pub agent: Agent,
    pub scope: Scope,
    pub source_directory: PathBuf,
    pub target_root: PathBuf,
    pub target_directory: PathBuf,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedInstallation {
    pub skill_key: String,
    #[serde(default)]
    pub source_locator: String,
    #[serde(default)]
    pub source_kind: Option<SourceKind>,
    pub agent: Agent,
    pub scope: Scope,
    pub target_directory: PathBuf,
    pub files: Vec<String>,
    pub source_revision: Option<String>,
    #[serde(default)]
    pub installed_fingerprint: String,
    #[serde(default = "enabled_by_default")]
    pub enabled: bool,
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
    #[error("managed installation was modified outside AgentHub")]
    ExternallyModified,
    #[error("Skill source changed after the installation plan was created")]
    SourceChanged,
    #[error("Skill state could not be persisted; disk changes were rolled back: {0}")]
    Persistence(String),
    #[error("workspace scope requires an authorized workspace directory")]
    WorkspaceRequired,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillTargetContext {
    home_directory: PathBuf,
    workspace_directory: Option<PathBuf>,
}

impl SkillTargetContext {
    pub fn new(
        home_directory: impl AsRef<Path>,
        workspace_directory: Option<impl AsRef<Path>>,
    ) -> Result<Self, InstallationError> {
        Ok(Self {
            home_directory: real_directory(home_directory.as_ref())?,
            workspace_directory: workspace_directory
                .map(|path| real_directory(path.as_ref()))
                .transpose()?,
        })
    }

    pub fn target_root(&self, agent: Agent, scope: Scope) -> Result<PathBuf, InstallationError> {
        let base = match scope {
            Scope::Global => &self.home_directory,
            Scope::Workspace => self
                .workspace_directory
                .as_ref()
                .ok_or(InstallationError::WorkspaceRequired)?,
        };
        Ok(match (agent, scope) {
            (Agent::ClaudeCode, _) => base.join(".claude/skills"),
            (Agent::Codex, _) => base.join(".agents/skills"),
            (Agent::OpenCode, Scope::Global) => base.join(".config/opencode/skills"),
            (Agent::OpenCode, Scope::Workspace) => base.join(".opencode/skills"),
        })
    }
}

pub fn plan_install_for(
    skill: &DiscoveredSkill,
    agent: Agent,
    scope: Scope,
    context: &SkillTargetContext,
) -> Result<InstallPlan, InstallationError> {
    plan_install(skill, agent, scope, context.target_root(agent, scope)?)
}

fn plan_install(
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
    let source_directory = skill.source_directory.clone();
    let source_metadata = fs::symlink_metadata(&source_directory).map_err(InstallationError::Io)?;
    if source_metadata.file_type().is_symlink() || !source_metadata.is_dir() {
        return Err(InstallationError::UnsafePath(source_directory));
    }
    let target_name = skill.name.as_deref().ok_or_else(|| {
        InstallationError::SourceUnavailable("Skill has no validated name".into())
    })?;
    let target_root = if target_root.as_ref().exists() {
        real_directory(target_root.as_ref())?
    } else {
        target_root.as_ref().to_path_buf()
    };
    ensure_no_symlink_components(&target_root)?;
    let target_directory = target_root.join(target_name);
    let mut files = Vec::new();
    collect_files(&source_directory, &source_directory, &mut files)?;
    files.sort();
    if files.len() > MAX_INSTALL_FILES {
        return Err(InstallationError::SourceUnavailable(
            "Skill contains too many files for a safe installation".into(),
        ));
    }
    let source_fingerprint = fingerprint_files(&source_directory, &files)?;
    Ok(InstallPlan {
        skill_key: format!(
            "{}@{}#{}",
            skill.source.locator,
            skill.source.requested_ref.as_deref().unwrap_or("default"),
            skill.relative_path
        ),
        source_locator: skill.source.locator.clone(),
        source_kind: skill.source.kind,
        source_revision: skill.source.resolved_commit.clone(),
        source_fingerprint,
        agent,
        scope,
        source_directory,
        target_root,
        target_directory,
        files,
    })
}

pub fn apply_install(plan: &InstallPlan) -> Result<ManagedInstallation, InstallationError> {
    apply_install_with(plan, |_| Ok::<(), Infallible>(()))
}

/// Command-layer service that keeps the filesystem and SQLite snapshot
/// consistent. Tauri handlers should call this instead of composing filesystem
/// and repository operations independently.
pub fn apply_install_persisted(
    plan: &InstallPlan,
    skill: &DiscoveredSkill,
    workspace_id: Option<i64>,
    context: &SkillTargetContext,
    repository: &dyn SkillRepository,
) -> Result<ManagedInstallation, InstallationError> {
    if context.target_root(plan.agent, plan.scope)? != plan.target_root
        || (plan.scope == Scope::Global) != workspace_id.is_none()
    {
        return Err(InstallationError::UnsafePath(plan.target_directory.clone()));
    }
    let source = NewSkillSource {
        source_type: plan.source_kind,
        canonical_locator: plan.source_locator.clone(),
        manifest_path: skill.source.manifest_path.clone(),
        requested_ref: skill.source.requested_ref.clone(),
        resolved_commit: plan.source_revision.clone(),
        source_fingerprint: Some(plan.source_fingerprint.clone()),
    };
    let descriptor = NewSkillDescriptor {
        source_id: 0,
        skill_key: plan.skill_key.clone(),
        relative_path: skill.relative_path.clone(),
        entrypoint_path: skill.entrypoint_path.clone(),
        display_name: skill.display_name.clone(),
        description: skill.description.clone(),
        kind: SkillKind::Standard,
        content_fingerprint: Some(plan.source_fingerprint.clone()),
        compatibility_json: serde_json::to_string(&skill.compatibility)
            .map_err(invalid_serialized_metadata)?,
        metadata_json: serde_json::to_string(&skill.metadata)
            .map_err(invalid_serialized_metadata)?,
    };
    apply_install_with(plan, |managed| {
        let installation = NewSkillInstallation {
            skill_id: 0,
            agent: managed.agent,
            scope: managed.scope,
            workspace_id,
            target_path: managed.target_directory.to_string_lossy().into_owned(),
            installed_revision: managed.source_revision.clone(),
            installed_fingerprint: Some(managed.installed_fingerprint.clone()),
            enabled: managed.enabled,
            state: InstallationState::Installed,
            managed_files_json: serde_json::to_string(&managed.files).map_err(|error| {
                crate::persistence::PersistenceError::InvalidInput(error.to_string())
            })?,
        };
        repository
            .save_skill_installation(&source, &descriptor, &installation)
            .map(|_| ())
    })
}

pub fn apply_install_persisted_authorized(
    manager: &crate::skills::SkillSourceManager,
    plan: &InstallPlan,
    skill: &DiscoveredSkill,
    workspace_id: Option<i64>,
    context: &SkillTargetContext,
    repository: &dyn SkillRepository,
) -> Result<ManagedInstallation, InstallationError> {
    manager
        .ensure_skill_authorized(skill)
        .map_err(|error| InstallationError::SourceUnavailable(error.to_string()))?;
    let current_plan = plan_install_for(skill, plan.agent, plan.scope, context)?;
    if &current_plan != plan {
        return Err(InstallationError::SourceChanged);
    }
    apply_install_persisted(plan, skill, workspace_id, context, repository)
}

pub fn set_enabled_persisted(
    target_directory: impl AsRef<Path>,
    enabled: bool,
    context: &SkillTargetContext,
    repository: &dyn SkillRepository,
) -> Result<ManagedInstallation, InstallationError> {
    authorize_managed_target(target_directory.as_ref(), context)?;
    set_enabled_with(target_directory, enabled, |managed| {
        repository
            .set_skill_installation_enabled(
                &managed.target_directory.to_string_lossy(),
                managed.enabled,
            )
            .and_then(|updated| {
                updated.then_some(()).ok_or_else(|| {
                    crate::persistence::PersistenceError::InvalidInput(
                        "managed Skill installation record is missing".into(),
                    )
                })
            })
    })
}

pub fn remove_installation_persisted(
    target_directory: impl AsRef<Path>,
    context: &SkillTargetContext,
    repository: &dyn SkillRepository,
) -> Result<ManagedInstallation, InstallationError> {
    authorize_managed_target(target_directory.as_ref(), context)?;
    remove_installation_with(target_directory, |managed| {
        repository
            .remove_skill_installation(&managed.target_directory.to_string_lossy())
            .and_then(|removed| {
                removed.then_some(()).ok_or_else(|| {
                    crate::persistence::PersistenceError::InvalidInput(
                        "managed Skill installation record is missing".into(),
                    )
                })
            })
    })
}

/// Apply a filesystem change and persist it as one logical operation.
///
/// The previous directory remains available until `persist` succeeds. If the
/// callback fails, the new directory is removed and the previous installation
/// is restored before an error is returned.
pub fn apply_install_with<E>(
    plan: &InstallPlan,
    persist: impl FnOnce(&ManagedInstallation) -> Result<(), E>,
) -> Result<ManagedInstallation, InstallationError>
where
    E: std::fmt::Display,
{
    if fingerprint_files(&plan.source_directory, &plan.files)? != plan.source_fingerprint {
        return Err(InstallationError::SourceChanged);
    }
    if plan
        .target_directory
        .symlink_metadata()
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err(InstallationError::UnsafePath(plan.target_directory.clone()));
    }
    ensure_no_symlink_components(&plan.target_root)?;
    if plan.target_directory.parent() != Some(plan.target_root.as_path()) {
        return Err(InstallationError::UnsafePath(plan.target_directory.clone()));
    }
    let existing = if plan.target_directory.exists() {
        let existing =
            read_marker(&plan.target_directory)?.ok_or(InstallationError::TargetExists)?;
        if existing.skill_key != plan.skill_key {
            return Err(InstallationError::TargetExists);
        }
        verify_managed_files(&plan.target_directory, &existing)?;
        Some(existing)
    } else {
        None
    };
    let parent = plan
        .target_directory
        .parent()
        .ok_or_else(|| InstallationError::UnsafePath(plan.target_directory.clone()))?;
    fs::create_dir_all(parent)?;
    let staging = unique_operation_directory(parent, &plan.target_directory, "staging")?;
    let result = (|| {
        let mut total_bytes = 0_u64;
        for relative in &plan.files {
            let source = safe_join(&plan.source_directory, relative)?;
            let target = safe_join(&staging, relative)?;
            let metadata = fs::symlink_metadata(&source)?;
            if !metadata.is_file() {
                return Err(InstallationError::UnsafePath(source));
            }
            total_bytes = total_bytes.saturating_add(metadata.len());
            if total_bytes > MAX_INSTALL_BYTES {
                return Err(InstallationError::SourceUnavailable(
                    "Skill exceeds the safe installation size limit".into(),
                ));
            }
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(source, target)?;
        }
        let installed_fingerprint = fingerprint_files(&staging, &plan.files)?;
        let managed = ManagedInstallation {
            skill_key: plan.skill_key.clone(),
            source_locator: plan.source_locator.clone(),
            source_kind: Some(plan.source_kind),
            agent: plan.agent,
            scope: plan.scope,
            target_directory: plan.target_directory.clone(),
            files: plan.files.clone(),
            source_revision: plan.source_revision.clone(),
            installed_fingerprint,
            enabled: true,
        };
        fs::write(
            staging.join(MARKER),
            serde_json::to_vec_pretty(&managed).map_err(|error| {
                InstallationError::Io(io::Error::new(io::ErrorKind::InvalidData, error))
            })?,
        )?;
        let rollback_directory =
            unique_operation_directory(parent, &plan.target_directory, "rollback")?;
        fs::remove_dir(&rollback_directory)?;
        if existing.is_some() {
            fs::rename(&plan.target_directory, &rollback_directory)?;
        }
        if let Err(error) = fs::rename(&staging, &plan.target_directory) {
            if existing.is_some() {
                let _ = fs::rename(&rollback_directory, &plan.target_directory);
            }
            return Err(error.into());
        }
        if let Err(error) = persist(&managed) {
            let failed = unique_operation_directory(parent, &plan.target_directory, "failed")?;
            fs::remove_dir(&failed)?;
            fs::rename(&plan.target_directory, &failed)?;
            if existing.is_some() {
                fs::rename(&rollback_directory, &plan.target_directory)?;
            }
            let _ = fs::remove_dir_all(failed);
            return Err(InstallationError::Persistence(error.to_string()));
        }
        if existing.is_some() {
            let _ = fs::remove_dir_all(rollback_directory);
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
    set_enabled_with(target_directory, enabled, |_| Ok::<(), Infallible>(()))
}

pub fn set_enabled_with<E>(
    target_directory: impl AsRef<Path>,
    enabled: bool,
    persist: impl FnOnce(&ManagedInstallation) -> Result<(), E>,
) -> Result<ManagedInstallation, InstallationError>
where
    E: std::fmt::Display,
{
    let target_directory = target_directory.as_ref();
    let previous = read_marker(target_directory)?.ok_or(InstallationError::InvalidMarker)?;
    verify_managed_files(target_directory, &previous)?;
    let mut managed = previous.clone();
    let enabled_entry = target_directory.join("SKILL.md");
    let disabled_entry = target_directory.join("SKILL.md.agent-hub-disabled");
    if enabled && disabled_entry.exists() {
        fs::rename(&disabled_entry, &enabled_entry)?;
    } else if !enabled && enabled_entry.exists() {
        fs::rename(&enabled_entry, &disabled_entry)?;
    }
    managed.enabled = enabled;
    managed.installed_fingerprint = fingerprint_files(target_directory, &managed.files)?;
    write_marker(target_directory, &managed)?;
    if let Err(error) = persist(&managed) {
        if enabled && enabled_entry.exists() {
            fs::rename(&enabled_entry, &disabled_entry)?;
        } else if !enabled && disabled_entry.exists() {
            fs::rename(&disabled_entry, &enabled_entry)?;
        }
        write_marker(target_directory, &previous)?;
        return Err(InstallationError::Persistence(error.to_string()));
    }
    Ok(managed)
}

pub fn remove_installation(
    target_directory: impl AsRef<Path>,
) -> Result<ManagedInstallation, InstallationError> {
    remove_installation_with(target_directory, |_| Ok::<(), Infallible>(()))
}

pub fn remove_installation_with<E>(
    target_directory: impl AsRef<Path>,
    persist: impl FnOnce(&ManagedInstallation) -> Result<(), E>,
) -> Result<ManagedInstallation, InstallationError>
where
    E: std::fmt::Display,
{
    let target_directory = target_directory.as_ref();
    let managed = read_marker(target_directory)?.ok_or(InstallationError::InvalidMarker)?;
    if managed.target_directory != target_directory {
        return Err(InstallationError::InvalidMarker);
    }
    verify_managed_files(target_directory, &managed)?;
    let parent = target_directory
        .parent()
        .ok_or_else(|| InstallationError::UnsafePath(target_directory.to_path_buf()))?;
    let tombstone = unique_operation_directory(parent, target_directory, "removed")?;
    fs::remove_dir(&tombstone)?;
    fs::rename(target_directory, &tombstone)?;
    if let Err(error) = persist(&managed) {
        fs::rename(&tombstone, target_directory)?;
        return Err(InstallationError::Persistence(error.to_string()));
    }
    let _ = fs::remove_dir_all(tombstone);
    Ok(managed)
}

pub fn managed_installation(
    target_directory: impl AsRef<Path>,
) -> Result<Option<ManagedInstallation>, InstallationError> {
    read_marker(target_directory.as_ref())
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
        } else if metadata.is_file()
            && path
                .file_name()
                .and_then(|name| name.to_str())
                .is_none_or(|name| name != MARKER && !name.starts_with(".agent-hub-"))
        {
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

fn real_directory(path: &Path) -> Result<PathBuf, InstallationError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(InstallationError::UnsafePath(path.to_path_buf()));
    }
    Ok(path.canonicalize()?)
}

fn ensure_no_symlink_components(path: &Path) -> Result<(), InstallationError> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component.as_os_str());
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(InstallationError::UnsafePath(current));
            }
            Ok(metadata) if !metadata.is_dir() => {
                return Err(InstallationError::UnsafePath(current));
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => break,
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
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

fn write_marker(directory: &Path, managed: &ManagedInstallation) -> Result<(), InstallationError> {
    let temporary = directory.join(format!("{MARKER}.tmp"));
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(managed).map_err(|error| {
            InstallationError::Io(io::Error::new(io::ErrorKind::InvalidData, error))
        })?,
    )?;
    fs::rename(temporary, directory.join(MARKER))?;
    Ok(())
}

fn verify_managed_files(
    directory: &Path,
    managed: &ManagedInstallation,
) -> Result<(), InstallationError> {
    if managed.installed_fingerprint.is_empty() {
        return Ok(());
    }
    let actual = fingerprint_files(directory, &managed.files)?;
    if actual == managed.installed_fingerprint {
        Ok(())
    } else {
        Err(InstallationError::ExternallyModified)
    }
}

fn authorize_managed_target(
    target_directory: &Path,
    context: &SkillTargetContext,
) -> Result<ManagedInstallation, InstallationError> {
    let managed = read_marker(target_directory)?.ok_or(InstallationError::InvalidMarker)?;
    let expected_root = context.target_root(managed.agent, managed.scope)?;
    if target_directory.parent() != Some(expected_root.as_path())
        || managed.target_directory != target_directory
    {
        return Err(InstallationError::UnsafePath(
            target_directory.to_path_buf(),
        ));
    }
    Ok(managed)
}

fn fingerprint_files(root: &Path, files: &[String]) -> Result<String, InstallationError> {
    let mut digest = Sha256::new();
    for relative in files {
        let mut path = safe_join(root, relative)?;
        if relative == "SKILL.md" && !path.exists() {
            let disabled = root.join("SKILL.md.agent-hub-disabled");
            if disabled.exists() {
                path = disabled;
            }
        }
        let metadata = fs::symlink_metadata(&path)?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(InstallationError::UnsafePath(path));
        }
        digest.update(relative.as_bytes());
        digest.update([0]);
        digest.update(fs::read(path)?);
        digest.update([0xff]);
    }
    Ok(format!("sha256:{:x}", digest.finalize()))
}

fn unique_operation_directory(
    parent: &Path,
    target: &Path,
    operation: &str,
) -> Result<PathBuf, InstallationError> {
    let name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("skill");
    let seed = timestamp_ms();
    for attempt in 0..128_u32 {
        let candidate = parent.join(format!(".{name}.agent-hub-{operation}-{seed}-{attempt}"));
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }
    Err(InstallationError::Io(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "could not allocate a unique operation directory",
    )))
}

const fn enabled_by_default() -> bool {
    true
}

fn invalid_serialized_metadata(error: serde_json::Error) -> InstallationError {
    InstallationError::Io(io::Error::new(io::ErrorKind::InvalidData, error))
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
    use crate::persistence::{Database, StorageSummaryRepository};
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
            source_directory: directory,
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

    #[test]
    fn matrix_resolves_distinct_global_and_workspace_targets_for_all_agents() {
        let source = tempdir().expect("source");
        let home = tempdir().expect("home");
        let workspace = tempdir().expect("workspace");
        let skill = fixture_skill(source.path());
        let context =
            SkillTargetContext::new(home.path(), Some(workspace.path())).expect("context");
        let mut targets = std::collections::BTreeSet::new();
        for agent in Agent::ALL {
            for scope in Scope::ALL {
                let plan = plan_install_for(&skill, *agent, *scope, &context).expect("plan");
                assert_eq!(plan.agent, *agent);
                assert_eq!(plan.scope, *scope);
                assert!(targets.insert(plan.target_directory.clone()));
                let installation = apply_install(&plan).expect("matrix target installs");
                assert!(installation.target_directory.join("SKILL.md").is_file());
            }
        }
        assert_eq!(targets.len(), 6);
    }

    #[test]
    fn persistence_failure_restores_previous_managed_installation() {
        let source = tempdir().expect("source");
        let target = tempdir().expect("target");
        let skill = fixture_skill(source.path());
        let plan =
            plan_install(&skill, Agent::ClaudeCode, Scope::Global, target.path()).expect("plan");
        apply_install(&plan).expect("initial install");
        fs::write(plan.source_directory.join("references/guide.md"), "updated")
            .expect("source update");
        let updated_plan = plan_install(&skill, Agent::ClaudeCode, Scope::Global, target.path())
            .expect("updated plan");
        let error = apply_install_with(&updated_plan, |_| Err::<(), _>("database unavailable"))
            .expect_err("persistence failure should fail");
        assert!(matches!(error, InstallationError::Persistence(_)));
        assert_eq!(
            fs::read_to_string(plan.target_directory.join("references/guide.md"))
                .expect("restored file"),
            "guide"
        );
    }

    #[test]
    fn source_change_after_preview_blocks_installation() {
        let source = tempdir().expect("source");
        let target = tempdir().expect("target");
        let skill = fixture_skill(source.path());
        let plan =
            plan_install(&skill, Agent::ClaudeCode, Scope::Global, target.path()).expect("plan");
        fs::write(plan.source_directory.join("references/guide.md"), "changed")
            .expect("source changes");
        assert!(matches!(
            apply_install(&plan),
            Err(InstallationError::SourceChanged)
        ));
        assert!(!plan.target_directory.exists());
    }

    #[test]
    fn external_modification_blocks_update_and_removal() {
        let source = tempdir().expect("source");
        let target = tempdir().expect("target");
        let skill = fixture_skill(source.path());
        let plan =
            plan_install(&skill, Agent::Codex, Scope::Workspace, target.path()).expect("plan");
        apply_install(&plan).expect("install");
        fs::write(plan.target_directory.join("references/guide.md"), "outside")
            .expect("external edit");
        assert!(matches!(
            apply_install(&plan),
            Err(InstallationError::ExternallyModified)
        ));
        assert!(matches!(
            remove_installation(&plan.target_directory),
            Err(InstallationError::ExternallyModified)
        ));
    }

    #[test]
    fn persisted_lifecycle_keeps_database_and_disk_in_sync() {
        let source = tempdir().expect("source");
        let target = tempdir().expect("target");
        let state = tempdir().expect("state");
        let database = Database::open(state.path().join("state.sqlite3")).expect("database");
        let skill = fixture_skill(source.path());
        let context = SkillTargetContext::new(target.path(), None::<&Path>).expect("context");
        let plan =
            plan_install_for(&skill, Agent::OpenCode, Scope::Global, &context).expect("plan");
        let installation = apply_install_persisted(&plan, &skill, None, &context, &database)
            .expect("disk and database install");
        assert!(installation.target_directory.join("SKILL.md").exists());
        assert_eq!(
            database
                .storage_summary()
                .expect("summary")
                .skill_installations,
            1
        );
        set_enabled_persisted(&installation.target_directory, false, &context, &database)
            .expect("disk and database disable");
        assert!(installation
            .target_directory
            .join("SKILL.md.agent-hub-disabled")
            .exists());
        remove_installation_persisted(&installation.target_directory, &context, &database)
            .expect("disk and database remove");
        assert!(!installation.target_directory.exists());
        assert_eq!(
            database
                .storage_summary()
                .expect("summary")
                .skill_installations,
            0
        );
    }
}
