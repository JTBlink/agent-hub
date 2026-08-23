//! Read-only Skill source discovery.
//!
//! This module deliberately does not clone repositories, execute scripts, follow
//! symlinks, or mutate a source directory. Git and skills.sh adapters can scan a
//! caller-provided checkout; fetching is a later, separately-authorized concern.

use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Component, Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

mod legacy_codex;
pub use legacy_codex::{
    resolve_legacy_codex_skill, LegacyCodexSkillAction, LegacyCodexSkillError,
    LegacyCodexSkillResolution,
};

const SKILL_FILE: &str = "SKILL.md";
const MAX_SKILL_BYTES: u64 = 1024 * 1024;
const MAX_SCAN_DEPTH: usize = 32;
const MAX_SCAN_ENTRIES: usize = 100_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SourceKind {
    PresetGit,
    Git,
    #[serde(rename = "local-directory")]
    Local,
    Marketplace,
    SkillsSh,
}

impl SourceKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::PresetGit => "preset-git",
            Self::Git => "git",
            Self::Local => "local-directory",
            Self::Marketplace => "marketplace",
            Self::SkillsSh => "skills-sh",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceMetadata {
    pub kind: SourceKind,
    pub locator: String,
    pub manifest_path: Option<String>,
    pub requested_ref: Option<String>,
    pub resolved_commit: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDiagnostic {
    pub code: String,
    pub message: String,
    pub severity: DiagnosticSeverity,
    pub path: Option<String>,
    pub target_path: Option<String>,
}

impl SourceDiagnostic {
    fn error(code: &str, message: impl Into<String>, path: Option<&Path>) -> Self {
        Self {
            code: code.to_owned(),
            message: message.into(),
            severity: DiagnosticSeverity::Error,
            path: path.map(path_string),
            target_path: None,
        }
    }

    fn warning(code: &str, message: impl Into<String>, path: Option<&Path>) -> Self {
        Self {
            code: code.to_owned(),
            message: message.into(),
            severity: DiagnosticSeverity::Warning,
            path: path.map(path_string),
            target_path: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredSkill {
    pub source: SourceMetadata,
    pub relative_path: String,
    pub entrypoint_path: String,
    /// Runtime-only location used to build an installation plan. Source identity
    /// remains in `source`; this path is never used as that identity.
    pub source_directory: PathBuf,
    pub display_name: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub license: Option<String>,
    pub compatibility: Option<String>,
    pub metadata: BTreeMap<String, String>,
    pub raw_frontmatter: Option<String>,
    pub installable: bool,
    pub diagnostics: Vec<SourceDiagnostic>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceScan {
    pub source: SourceMetadata,
    pub skills: Vec<DiscoveredSkill>,
    pub catalog_entries: Vec<MarketplaceEntry>,
    pub diagnostics: Vec<SourceDiagnostic>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkill {
    pub agent: crate::Agent,
    pub scope: crate::Scope,
    pub path: String,
    pub storage_kind: SkillStorageKind,
    pub real_path: String,
    pub source: SourceMetadata,
    pub display_name: String,
    pub name: Option<String>,
    pub relative_path: String,
    pub compatibility: Option<String>,
    /// Human-facing version declared by the Skill, falling back to the
    /// immutable installed source revision for managed Git sources.
    pub current_version: Option<String>,
    pub installed_fingerprint: Option<String>,
    pub enabled: bool,
    pub source_tracked: bool,
    pub diagnostics: Vec<SourceDiagnostic>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillStorageKind {
    Copy,
    Symlink,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInventory {
    pub skills: Vec<InstalledSkill>,
    pub duplicate_names: Vec<String>,
    pub diagnostics: Vec<SourceDiagnostic>,
    pub roots: Vec<SkillRootUsage>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRootUsage {
    pub path: String,
    pub bytes: u64,
    pub skill_count: usize,
}

/// Scan the standard read-only Skill roots for all supported Agents.
pub fn scan_installed_skills(
    home_directory: impl AsRef<Path>,
    workspace_directory: Option<impl AsRef<Path>>,
) -> SkillInventory {
    let home = home_directory.as_ref();
    let mut roots = vec![
        (
            crate::Agent::ClaudeCode,
            crate::Scope::Global,
            home.join(".claude/skills"),
        ),
        (
            crate::Agent::Codex,
            crate::Scope::Global,
            home.join(".agents/skills"),
        ),
        (
            crate::Agent::Codex,
            crate::Scope::Global,
            home.join(".codex/skills"),
        ),
        (
            crate::Agent::OpenCode,
            crate::Scope::Global,
            home.join(".config/opencode/skills"),
        ),
        (
            crate::Agent::OpenCode,
            crate::Scope::Global,
            home.join(".claude/skills"),
        ),
        (
            crate::Agent::OpenCode,
            crate::Scope::Global,
            home.join(".agents/skills"),
        ),
    ];
    if let Some(workspace) = workspace_directory {
        let workspace = workspace.as_ref();
        roots.extend([
            (
                crate::Agent::ClaudeCode,
                crate::Scope::Workspace,
                workspace.join(".claude/skills"),
            ),
            (
                crate::Agent::Codex,
                crate::Scope::Workspace,
                workspace.join(".agents/skills"),
            ),
            (
                crate::Agent::OpenCode,
                crate::Scope::Workspace,
                workspace.join(".opencode/skills"),
            ),
            (
                crate::Agent::OpenCode,
                crate::Scope::Workspace,
                workspace.join(".claude/skills"),
            ),
            (
                crate::Agent::OpenCode,
                crate::Scope::Workspace,
                workspace.join(".agents/skills"),
            ),
        ]);
    }

    let mut inventory = SkillInventory {
        skills: Vec::new(),
        duplicate_names: Vec::new(),
        diagnostics: Vec::new(),
        roots: Vec::new(),
    };
    let mut names = BTreeMap::<(String, String, String), usize>::new();
    for (agent, scope, root) in roots {
        if !root.exists() {
            continue;
        }
        if inventory
            .roots
            .iter()
            .all(|usage| Path::new(&usage.path) != root)
        {
            inventory.roots.push(SkillRootUsage {
                path: path_string(&root),
                bytes: directory_size(&root),
                skill_count: 0,
            });
        }
        match LocalSourceAdapter::new(&root).scan() {
            Ok(scan) => {
                for skill in scan.skills {
                    let key = skill
                        .name
                        .clone()
                        .unwrap_or_else(|| skill.display_name.clone());
                    *names
                        .entry((agent.as_str().into(), scope.as_str().into(), key))
                        .or_default() += 1;
                    let entrypoint = root.join(&skill.entrypoint_path);
                    let managed = entrypoint.parent().and_then(|directory| {
                        crate::skill_installation::managed_installation(directory)
                            .ok()
                            .flatten()
                    });
                    let source = managed
                        .as_ref()
                        .filter(|installation| !installation.source_locator.is_empty())
                        .map(|installation| SourceMetadata {
                            kind: installation.source_kind.unwrap_or(SourceKind::Git),
                            locator: installation.source_locator.clone(),
                            manifest_path: installation.source_manifest_path.clone(),
                            requested_ref: installation.source_requested_ref.clone(),
                            resolved_commit: installation.source_revision.clone(),
                        })
                        .unwrap_or_else(|| skill.source.clone());
                    let current_version = skill.metadata.get("version").cloned().or_else(|| {
                        managed
                            .as_ref()
                            .and_then(|installation| installation.source_revision.clone())
                    });
                    inventory.skills.push(InstalledSkill {
                        agent,
                        scope,
                        path: path_string(&entrypoint),
                        storage_kind: storage_kind(&entrypoint),
                        real_path: real_skill_path(&entrypoint),
                        source,
                        display_name: skill.display_name,
                        name: skill.name,
                        relative_path: skill.relative_path,
                        compatibility: skill.compatibility,
                        current_version,
                        installed_fingerprint: managed
                            .as_ref()
                            .map(|installation| installation.installed_fingerprint.clone()),
                        enabled: true,
                        source_tracked: managed.is_some(),
                        diagnostics: skill.diagnostics,
                    });
                }
                append_disabled_managed_skills(agent, scope, &root, &mut inventory, &mut names);
                inventory.diagnostics.extend(scan.diagnostics);
            }
            Err(error) => inventory.diagnostics.push(SourceDiagnostic::error(
                "skill-root-unreadable",
                error.to_string(),
                Some(&root),
            )),
        }
    }
    inventory.duplicate_names = names
        .into_iter()
        .filter_map(|((_agent, _scope, name), count)| (count > 1).then_some(name))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    for usage in &mut inventory.roots {
        usage.skill_count = inventory
            .skills
            .iter()
            .filter(|skill| Path::new(&skill.path).starts_with(&usage.path))
            .map(|skill| skill.path.as_str())
            .collect::<BTreeSet<_>>()
            .len();
    }
    let preferred_root = home.join(".agents/skills");
    let legacy_root = home.join(".codex/skills");
    let preferred_names = inventory
        .skills
        .iter()
        .filter(|skill| {
            skill.agent == crate::Agent::Codex
                && skill.scope == crate::Scope::Global
                && Path::new(&skill.path).starts_with(&preferred_root)
        })
        .map(installed_skill_name)
        .collect::<BTreeSet<_>>();
    let legacy_only = inventory
        .skills
        .iter()
        .filter_map(|skill| {
            let name = installed_skill_name(skill);
            if skill.agent == crate::Agent::Codex
                && skill.scope == crate::Scope::Global
                && Path::new(&skill.path).starts_with(&legacy_root)
                && !is_codex_system_skill(skill, &legacy_root)
                && !preferred_names.contains(&name)
            {
                Some(SourceDiagnostic::warning(
                    "codex-legacy-location",
                    "Codex Skill is installed only in the legacy ~/.codex/skills directory",
                    Some(Path::new(&skill.path)),
                ))
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    inventory.diagnostics.extend(legacy_only);
    inventory
}

fn directory_size(path: &Path) -> u64 {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return 0;
    };
    if metadata.file_type().is_symlink() {
        return 0;
    }
    if metadata.is_file() {
        return metadata.len();
    }
    fs::read_dir(path)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| directory_size(&entry.path()))
                .sum()
        })
        .unwrap_or_default()
}

fn installed_skill_name(skill: &InstalledSkill) -> String {
    skill
        .name
        .clone()
        .unwrap_or_else(|| skill.display_name.clone())
}

fn is_codex_system_skill(skill: &InstalledSkill, legacy_root: &Path) -> bool {
    Path::new(&skill.path)
        .strip_prefix(legacy_root)
        .ok()
        .and_then(|relative| relative.components().next())
        .is_some_and(|component| {
            matches!(
                component,
                Component::Normal(name) if name == std::ffi::OsStr::new(".system")
            )
        })
}

fn storage_kind(entrypoint: &Path) -> SkillStorageKind {
    entrypoint
        .parent()
        .and_then(|directory| fs::symlink_metadata(directory).ok())
        .filter(|metadata| metadata.file_type().is_symlink())
        .map(|_| SkillStorageKind::Symlink)
        .unwrap_or(SkillStorageKind::Copy)
}

fn real_skill_path(entrypoint: &Path) -> String {
    entrypoint
        .canonicalize()
        .unwrap_or_else(|_| entrypoint.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

fn append_disabled_managed_skills(
    agent: crate::Agent,
    scope: crate::Scope,
    root: &Path,
    inventory: &mut SkillInventory,
    names: &mut BTreeMap<(String, String, String), usize>,
) {
    fn visit(
        agent: crate::Agent,
        scope: crate::Scope,
        root: &Path,
        directory: &Path,
        depth: usize,
        inventory: &mut SkillInventory,
        names: &mut BTreeMap<(String, String, String), usize>,
    ) {
        if depth > MAX_SCAN_DEPTH {
            return;
        }
        let Ok(entries) = fs::read_dir(directory) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                visit(agent, scope, root, &path, depth + 1, inventory, names);
                continue;
            }
            if entry.file_name() != "SKILL.md.agent-hub-disabled" {
                continue;
            }
            let Some(parent) = path.parent() else {
                continue;
            };
            let Ok(Some(managed)) = crate::skill_installation::managed_installation(parent) else {
                continue;
            };
            let source = SourceMetadata {
                kind: managed
                    .source_kind
                    .unwrap_or(if managed.source_locator.is_empty() {
                        SourceKind::Local
                    } else {
                        SourceKind::Git
                    }),
                locator: if managed.source_locator.is_empty() {
                    path_string(root)
                } else {
                    managed.source_locator
                },
                manifest_path: managed.source_manifest_path.clone(),
                requested_ref: managed.source_requested_ref.clone(),
                resolved_commit: managed.source_revision.clone(),
            };
            let skill = parse_skill(root, &path, source);
            let key = skill
                .name
                .clone()
                .unwrap_or_else(|| skill.display_name.clone());
            *names
                .entry((agent.as_str().into(), scope.as_str().into(), key))
                .or_default() += 1;
            let current_version = skill
                .metadata
                .get("version")
                .cloned()
                .or_else(|| managed.source_revision.clone());
            inventory.skills.push(InstalledSkill {
                agent,
                scope,
                path: path_string(&path),
                storage_kind: storage_kind(&path),
                real_path: real_skill_path(&path),
                source: skill.source.clone(),
                display_name: skill.display_name,
                name: skill.name,
                relative_path: skill.relative_path,
                compatibility: skill.compatibility,
                current_version,
                installed_fingerprint: Some(managed.installed_fingerprint.clone()),
                enabled: false,
                source_tracked: true,
                diagnostics: skill.diagnostics,
            });
        }
    }
    visit(agent, scope, root, root, 0, inventory, names);
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceEntry {
    pub name: Option<String>,
    pub description: Option<String>,
    pub version: Option<String>,
    pub author: Option<String>,
    pub homepage: Option<String>,
    pub compatibility: Option<Value>,
    /// Preserves string and structured source forms without executing them.
    pub source: Option<Value>,
    /// Full manifest entry retained so newer optional fields remain visible.
    pub raw: Value,
    pub installable: bool,
    pub diagnostics: Vec<SourceDiagnostic>,
}

/// Resolve the standard GitHub object form used by Claude Marketplace
/// manifests. Local string sources are handled by the marketplace adapter and
/// therefore return `None` here.
pub fn marketplace_git_locator(
    entry: &MarketplaceEntry,
) -> Result<Option<GitLocator>, SourceError> {
    let Some(source) = entry.source.as_ref() else {
        return Ok(None);
    };
    let Some(object) = source.as_object() else {
        return Ok(None);
    };
    if object.get("source").and_then(Value::as_str) != Some("github") {
        return Ok(None);
    }
    let repository = object.get("repo").and_then(Value::as_str).ok_or_else(|| {
        SourceError::InvalidLocator("GitHub marketplace source requires repo".into())
    })?;
    let mut parts = repository.split('/');
    let owner = parts.next().unwrap_or_default();
    let name = parts.next().unwrap_or_default();
    if owner.is_empty() || name.is_empty() || parts.next().is_some() {
        return Err(SourceError::InvalidLocator(
            "GitHub marketplace repo must be owner/repository".into(),
        ));
    }
    let requested_ref = object.get("ref").and_then(Value::as_str).map(str::to_owned);
    let subdirectory = object
        .get("path")
        .and_then(Value::as_str)
        .map(str::to_owned);
    GitLocator::new(
        format!("https://github.com/{owner}/{name}.git"),
        requested_ref,
        subdirectory,
    )
    .map(Some)
}

#[derive(Debug, Error)]
pub enum SourceError {
    #[error("source path is not a directory: {0}")]
    NotDirectory(PathBuf),
    #[error("source is unavailable until a trusted checkout is provided")]
    CheckoutRequired,
    #[error("could not read source: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid source locator: {0}")]
    InvalidLocator(String),
    #[error("git executable is unavailable")]
    GitUnavailable,
    #[error("Git source could not be reached")]
    GitNetworkFailure,
    #[error("Git source rate limit was reached; retry later")]
    GitRateLimited,
    #[error("requested Git ref does not resolve to a commit")]
    GitReferenceUnavailable,
    #[error("git {operation} failed with exit code {code}")]
    GitCheckoutFailed { operation: &'static str, code: i32 },
    #[error("source path has not been explicitly authorized: {0}")]
    Unauthorized(PathBuf),
    #[error("source authorization state is unavailable")]
    AuthorizationUnavailable,
}

/// The only seam required by inventory and future installation planning.
pub trait SkillSourceAdapter: Send + Sync {
    fn metadata(&self) -> &SourceMetadata;
    fn scan(&self) -> Result<SourceScan, SourceError>;
}

/// Authorization and checkout boundary for source commands. Local paths must
/// be explicitly authorized; remote repositories are cloned under an
/// AgentHub-owned cache directory.
#[derive(Debug)]
pub struct SkillSourceManager {
    cache_root: PathBuf,
    authorized_local_roots: Mutex<BTreeMap<PathBuf, SourceMetadata>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum SourceRequest {
    LocalDirectory {
        path: PathBuf,
    },
    Git {
        url: String,
        requested_ref: Option<String>,
        subdirectory: Option<String>,
    },
    Marketplace {
        manifest: PathBuf,
    },
    SkillsSh {
        owner_repository: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceBrowseResult {
    pub source: SourceMetadata,
    pub skills: Vec<DiscoveredSkill>,
    pub catalog_entries: Vec<MarketplaceEntry>,
    pub diagnostics: Vec<SourceDiagnostic>,
}

impl SkillSourceManager {
    pub fn new(cache_root: impl Into<PathBuf>) -> Self {
        Self {
            cache_root: cache_root.into(),
            authorized_local_roots: Mutex::new(BTreeMap::new()),
        }
    }

    pub fn browse(&self, request: SourceRequest) -> Result<SourceBrowseResult, SourceError> {
        let scan = match request {
            SourceRequest::LocalDirectory { path } => self.authorize_and_scan_local(path)?,
            SourceRequest::Marketplace { manifest } => self.browse_marketplace(manifest)?,
            SourceRequest::Git {
                url,
                requested_ref,
                subdirectory,
            } => self
                .fetch_git(GitLocator::new(url, requested_ref, subdirectory)?)?
                .scan()?,
            SourceRequest::SkillsSh { owner_repository } => self
                .fetch_skills_sh(SkillsShSourceAdapter::new(&owner_repository)?)?
                .scan()?,
        };
        Ok(SourceBrowseResult {
            source: scan.source.clone(),
            skills: scan.skills,
            catalog_entries: scan.catalog_entries,
            diagnostics: scan.diagnostics,
        })
    }

    fn browse_marketplace(&self, manifest: PathBuf) -> Result<SourceScan, SourceError> {
        let mut scan = self.authorize_and_scan_marketplace(manifest)?;
        let mut diagnostics = scan
            .diagnostics
            .iter()
            .filter(|item| !item.code.starts_with("marketplace-source-"))
            .cloned()
            .collect::<Vec<_>>();
        for entry in &mut scan.catalog_entries {
            let locator = match marketplace_git_locator(entry) {
                Ok(Some(locator)) => locator,
                Ok(None) => continue,
                Err(error) => {
                    entry.diagnostics.push(SourceDiagnostic::error(
                        "marketplace-source-invalid",
                        error.to_string(),
                        scan.source.manifest_path.as_deref().map(Path::new),
                    ));
                    continue;
                }
            };
            entry
                .diagnostics
                .retain(|item| item.code != "marketplace-source-unresolved");
            match self.fetch_git(locator).and_then(|adapter| adapter.scan()) {
                Ok(remote) => {
                    entry.installable = remote.skills.iter().any(|skill| skill.installable);
                    entry.diagnostics.extend(remote.diagnostics);
                    scan.skills.extend(remote.skills);
                }
                Err(error) => entry.diagnostics.push(SourceDiagnostic::error(
                    "marketplace-source-fetch-failed",
                    error.to_string(),
                    scan.source.manifest_path.as_deref().map(Path::new),
                )),
            }
        }
        diagnostics.extend(
            scan.catalog_entries
                .iter()
                .flat_map(|entry| entry.diagnostics.clone()),
        );
        scan.diagnostics = diagnostics;
        Ok(scan)
    }

    pub fn authorize_and_scan_local(
        &self,
        root: impl AsRef<Path>,
    ) -> Result<SourceScan, SourceError> {
        let canonical = authorized_directory(root.as_ref())?;
        self.authorized_local_roots
            .lock()
            .map_err(|_| SourceError::AuthorizationUnavailable)?
            .insert(
                canonical.clone(),
                LocalSourceAdapter::new(&canonical).metadata().clone(),
            );
        LocalSourceAdapter::new(canonical).scan()
    }

    pub fn scan_authorized_local(&self, root: impl AsRef<Path>) -> Result<SourceScan, SourceError> {
        let canonical = authorized_directory(root.as_ref())?;
        let authorized = self
            .authorized_local_roots
            .lock()
            .map_err(|_| SourceError::AuthorizationUnavailable)?;
        if !authorized.contains_key(&canonical) {
            return Err(SourceError::Unauthorized(canonical));
        }
        drop(authorized);
        LocalSourceAdapter::new(canonical).scan()
    }

    pub fn scan_authorized_marketplace(
        &self,
        manifest: impl AsRef<Path>,
    ) -> Result<SourceScan, SourceError> {
        let manifest = manifest.as_ref().canonicalize()?;
        let authorized = self
            .authorized_local_roots
            .lock()
            .map_err(|_| SourceError::AuthorizationUnavailable)?;
        if !authorized.keys().any(|root| manifest.starts_with(root)) {
            return Err(SourceError::Unauthorized(manifest));
        }
        drop(authorized);
        MarketplaceSourceAdapter::new(manifest).scan()
    }

    pub fn authorize_and_scan_marketplace(
        &self,
        manifest: impl AsRef<Path>,
    ) -> Result<SourceScan, SourceError> {
        let manifest = manifest.as_ref().canonicalize()?;
        let root = marketplace_root(&manifest)
            .ok_or_else(|| SourceError::InvalidLocator("manifest has no parent".into()))?;
        let root = authorized_directory(root)?;
        self.authorized_local_roots
            .lock()
            .map_err(|_| SourceError::AuthorizationUnavailable)?
            .insert(
                root,
                MarketplaceSourceAdapter::new(&manifest).metadata().clone(),
            );
        MarketplaceSourceAdapter::new(manifest).scan()
    }

    pub fn fetch_git(&self, locator: GitLocator) -> Result<GitSourceAdapter, SourceError> {
        fs::create_dir_all(&self.cache_root)?;
        let cache_root = authorized_directory(&self.cache_root)?;
        let destination = unused_destination(&cache_root, "git-source")?;
        let adapter = GitSourceAdapter::fetch(locator, destination)?;
        let content_root = adapter.checkout.as_ref().map(|checkout| {
            adapter
                .locator
                .subdirectory
                .as_deref()
                .map_or_else(|| checkout.clone(), |path| checkout.join(path))
        });
        self.authorize_checkout(content_root.as_deref(), adapter.metadata())?;
        Ok(adapter)
    }

    pub fn fetch_skills_sh(
        &self,
        source: SkillsShSourceAdapter,
    ) -> Result<SkillsShSourceAdapter, SourceError> {
        fs::create_dir_all(&self.cache_root)?;
        let cache_root = authorized_directory(&self.cache_root)?;
        let destination = unused_destination(&cache_root, "skills-sh-source")?;
        let source = source.fetch(destination)?;
        self.authorize_checkout(source.checkout.as_deref(), source.metadata())?;
        Ok(source)
    }

    pub fn ensure_skill_authorized(&self, skill: &DiscoveredSkill) -> Result<(), SourceError> {
        self.validated_skill(skill).map(|_| ())
    }

    pub fn validated_skill(
        &self,
        requested: &DiscoveredSkill,
    ) -> Result<DiscoveredSkill, SourceError> {
        let source_directory = authorized_directory(&requested.source_directory)?;
        let authorized = self
            .authorized_local_roots
            .lock()
            .map_err(|_| SourceError::AuthorizationUnavailable)?;
        let (root, metadata) = authorized
            .iter()
            .filter(|(root, _)| source_directory.starts_with(root))
            .max_by_key(|(root, _)| root.components().count())
            .map(|(root, metadata)| (root.clone(), metadata.clone()))
            .ok_or_else(|| SourceError::Unauthorized(source_directory.clone()))?;
        drop(authorized);
        let scan = if metadata.kind == SourceKind::Marketplace {
            let manifest = metadata.manifest_path.as_deref().ok_or_else(|| {
                SourceError::InvalidLocator("Marketplace manifest is missing".into())
            })?;
            MarketplaceSourceAdapter::new(manifest).scan()?
        } else {
            scan_directory(&root, metadata)?
        };
        scan.skills
            .into_iter()
            .find(|skill| {
                skill
                    .source_directory
                    .canonicalize()
                    .is_ok_and(|path| path == source_directory)
                    && skill.name == requested.name
                    && skill.relative_path == requested.relative_path
            })
            .ok_or_else(|| {
                SourceError::InvalidLocator(
                    "Skill no longer matches the authorized source snapshot".into(),
                )
            })
    }

    fn authorize_checkout(
        &self,
        checkout: Option<&Path>,
        metadata: &SourceMetadata,
    ) -> Result<(), SourceError> {
        let checkout = checkout.ok_or(SourceError::CheckoutRequired)?;
        let checkout = authorized_directory(checkout)?;
        self.authorized_local_roots
            .lock()
            .map_err(|_| SourceError::AuthorizationUnavailable)?
            .insert(checkout, metadata.clone());
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct LocalSourceAdapter {
    root: PathBuf,
    metadata: SourceMetadata,
}

impl LocalSourceAdapter {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        let root = root.into();
        Self {
            metadata: SourceMetadata {
                kind: SourceKind::Local,
                locator: path_string(&root),
                manifest_path: None,
                requested_ref: None,
                resolved_commit: None,
            },
            root,
        }
    }
}

impl SkillSourceAdapter for LocalSourceAdapter {
    fn metadata(&self) -> &SourceMetadata {
        &self.metadata
    }

    fn scan(&self) -> Result<SourceScan, SourceError> {
        scan_directory(&self.root, self.metadata.clone())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitLocator {
    pub url: String,
    pub requested_ref: Option<String>,
    pub subdirectory: Option<String>,
}

impl GitLocator {
    pub fn new(
        url: impl Into<String>,
        requested_ref: Option<String>,
        subdirectory: Option<String>,
    ) -> Result<Self, SourceError> {
        let url = url.into();
        if url.contains(char::is_whitespace)
            || !(url.starts_with("https://")
                || url.starts_with("http://")
                || url.starts_with("ssh://")
                || url.starts_with("git@"))
        {
            return Err(SourceError::InvalidLocator(
                "Git URL must use http(s), ssh, or scp syntax".into(),
            ));
        }
        if subdirectory
            .as_deref()
            .is_some_and(|value| !is_safe_relative_path(Path::new(value)))
        {
            return Err(SourceError::InvalidLocator(
                "Git subdirectory must be a relative path without '..'".into(),
            ));
        }
        if requested_ref
            .as_deref()
            .is_some_and(|value| !valid_git_ref(value))
        {
            return Err(SourceError::InvalidLocator(
                "Git ref contains unsafe or unsupported characters".into(),
            ));
        }
        Ok(Self {
            url,
            requested_ref,
            subdirectory,
        })
    }
}

#[derive(Debug, Clone)]
pub struct GitSourceAdapter {
    locator: GitLocator,
    checkout: Option<PathBuf>,
    metadata: SourceMetadata,
}

impl GitSourceAdapter {
    pub fn new(locator: GitLocator) -> Self {
        Self::with_checkout(locator, None)
    }

    pub fn from_checkout(locator: GitLocator, checkout: impl Into<PathBuf>) -> Self {
        Self::with_checkout(locator, Some(checkout.into()))
    }

    pub fn checkout(mut self, checkout: impl Into<PathBuf>) -> Self {
        self.checkout = Some(checkout.into());
        self
    }

    pub fn resolved_commit(mut self, commit: impl Into<String>) -> Result<Self, SourceError> {
        let commit = commit.into();
        if commit.len() < 7
            || !commit
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        {
            return Err(SourceError::InvalidLocator(
                "resolved Git commit must be a hexadecimal object id".into(),
            ));
        }
        self.metadata.resolved_commit = Some(commit);
        Ok(self)
    }

    fn with_checkout(locator: GitLocator, checkout: Option<PathBuf>) -> Self {
        let metadata = SourceMetadata {
            kind: SourceKind::Git,
            locator: locator.url.clone(),
            manifest_path: None,
            requested_ref: locator.requested_ref.clone(),
            resolved_commit: None,
        };
        Self {
            locator,
            checkout,
            metadata,
        }
    }

    pub fn fetch(
        locator: GitLocator,
        destination: impl Into<PathBuf>,
    ) -> Result<Self, SourceError> {
        let destination = destination.into();
        if destination
            .symlink_metadata()
            .map(|metadata| metadata.file_type().is_symlink())
            .unwrap_or(false)
        {
            return Err(SourceError::InvalidLocator(
                "Git destination cannot be a symlink".into(),
            ));
        }
        let destination_was_empty = destination.exists()
            && fs::read_dir(&destination)
                .map_err(SourceError::Io)?
                .next()
                .is_none();
        if destination.exists() && !destination_was_empty {
            return Err(SourceError::InvalidLocator(
                "Git destination must be empty".into(),
            ));
        }
        let parent = destination
            .parent()
            .ok_or_else(|| SourceError::InvalidLocator("Git destination has no parent".into()))?;
        fs::create_dir_all(parent)?;
        let staging = unique_sibling(parent, ".agent-hub-git-staging")?;
        let hooks_directory = staging.join(".empty-hooks");
        fs::create_dir_all(&hooks_directory)?;
        let hooks_config = format!("core.hooksPath={}", path_string(&hooks_directory));
        let mut clone = isolated_git_command();
        clone
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .arg("-c")
            .arg(&hooks_config)
            .arg("clone")
            .arg("--no-recurse-submodules")
            .arg(&locator.url)
            .arg(staging.join("checkout"));
        let output = clone.output().map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                SourceError::GitUnavailable
            } else {
                SourceError::Io(error)
            }
        })?;
        if !output.status.success() {
            let _ = fs::remove_dir_all(&staging);
            return Err(classify_git_clone_failure(
                output.status.code().unwrap_or(-1),
                &String::from_utf8_lossy(&output.stderr),
            ));
        }
        let checkout = staging.join("checkout");
        if let Some(reference) = locator.requested_ref.as_deref() {
            let reference_expression = format!("{reference}^{{commit}}");
            let resolved = isolated_git_command()
                .arg("-c")
                .arg(&hooks_config)
                .arg("-C")
                .arg(&checkout)
                .args(["rev-parse", "--verify", "--end-of-options"])
                .arg(&reference_expression)
                .output()
                .map_err(SourceError::Io)?;
            if !resolved.status.success() {
                let _ = fs::remove_dir_all(&staging);
                return Err(SourceError::GitReferenceUnavailable);
            }
            let commit = String::from_utf8_lossy(&resolved.stdout).trim().to_owned();
            let status = isolated_git_command()
                .arg("-c")
                .arg(&hooks_config)
                .arg("-C")
                .arg(&checkout)
                .args(["checkout", "--detach"])
                .arg(commit)
                .status()
                .map_err(SourceError::Io)?;
            if !status.success() {
                let _ = fs::remove_dir_all(&staging);
                return Err(SourceError::GitCheckoutFailed {
                    operation: "checkout",
                    code: status.code().unwrap_or(-1),
                });
            }
        }
        let output = isolated_git_command()
            .arg("-C")
            .arg(&checkout)
            .args(["rev-parse", "HEAD"])
            .output()
            .map_err(SourceError::Io)?;
        if !output.status.success() {
            let _ = fs::remove_dir_all(&staging);
            return Err(SourceError::GitCheckoutFailed {
                operation: "rev-parse",
                code: output.status.code().unwrap_or(-1),
            });
        }
        let commit = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        if destination_was_empty {
            fs::remove_dir(&destination)?;
        }
        if let Err(error) = fs::rename(&checkout, &destination) {
            let _ = fs::remove_dir_all(&staging);
            return Err(SourceError::Io(error));
        }
        let _ = fs::remove_dir_all(&staging);
        Self::from_checkout(locator, destination).resolved_commit(commit)
    }
}

impl SkillSourceAdapter for GitSourceAdapter {
    fn metadata(&self) -> &SourceMetadata {
        &self.metadata
    }

    fn scan(&self) -> Result<SourceScan, SourceError> {
        let checkout = self
            .checkout
            .as_ref()
            .ok_or(SourceError::CheckoutRequired)?;
        let root = self
            .locator
            .subdirectory
            .as_deref()
            .map_or_else(|| checkout.clone(), |subdir| checkout.join(subdir));
        scan_directory(&root, self.metadata.clone())
    }
}

#[derive(Debug, Clone)]
pub struct SkillsShSourceAdapter {
    owner: String,
    repository: String,
    checkout: Option<PathBuf>,
    metadata: SourceMetadata,
}

impl SkillsShSourceAdapter {
    pub fn new(owner_repository: &str) -> Result<Self, SourceError> {
        let owner_repository = owner_repository
            .strip_prefix("https://skills.sh/")
            .unwrap_or(owner_repository)
            .trim_end_matches('/');
        let mut parts = owner_repository.split('/');
        let owner = parts.next().unwrap_or_default();
        let repository = parts.next().unwrap_or_default();
        if owner.is_empty()
            || repository.is_empty()
            || parts.next().is_some()
            || [owner, repository]
                .iter()
                .any(|part| part.contains("..") || part.contains(char::is_whitespace))
        {
            return Err(SourceError::InvalidLocator(
                "skills.sh source must be an owner/repository pair".into(),
            ));
        }
        Ok(Self {
            owner: owner.into(),
            repository: repository.into(),
            checkout: None,
            metadata: SourceMetadata {
                kind: SourceKind::SkillsSh,
                locator: format!("https://skills.sh/{owner}/{repository}"),
                manifest_path: None,
                requested_ref: None,
                resolved_commit: None,
            },
        })
    }

    pub fn from_checkout(mut self, checkout: impl Into<PathBuf>) -> Self {
        self.checkout = Some(checkout.into());
        self
    }

    pub fn owner_repository(&self) -> (&str, &str) {
        (&self.owner, &self.repository)
    }

    pub fn fetch(mut self, destination: impl Into<PathBuf>) -> Result<Self, SourceError> {
        let locator = GitLocator::new(
            format!("https://github.com/{}/{}.git", self.owner, self.repository),
            None,
            None,
        )?;
        let checkout = GitSourceAdapter::fetch(locator, destination)?;
        self.checkout = checkout.checkout;
        self.metadata.resolved_commit = checkout.metadata.resolved_commit;
        Ok(self)
    }
}

impl SkillSourceAdapter for SkillsShSourceAdapter {
    fn metadata(&self) -> &SourceMetadata {
        &self.metadata
    }

    fn scan(&self) -> Result<SourceScan, SourceError> {
        let checkout = self
            .checkout
            .as_ref()
            .ok_or(SourceError::CheckoutRequired)?;
        scan_directory(checkout, self.metadata.clone())
    }
}

#[derive(Debug, Clone)]
pub struct MarketplaceSourceAdapter {
    manifest: PathBuf,
    metadata: SourceMetadata,
}

impl MarketplaceSourceAdapter {
    pub fn new(manifest: impl Into<PathBuf>) -> Self {
        let manifest = manifest.into();
        Self {
            metadata: SourceMetadata {
                kind: SourceKind::Marketplace,
                locator: marketplace_root(&manifest)
                    .map(path_string)
                    .unwrap_or_default(),
                manifest_path: Some(path_string(&manifest)),
                requested_ref: None,
                resolved_commit: None,
            },
            manifest,
        }
    }
}

impl SkillSourceAdapter for MarketplaceSourceAdapter {
    fn metadata(&self) -> &SourceMetadata {
        &self.metadata
    }

    fn scan(&self) -> Result<SourceScan, SourceError> {
        parse_marketplace(&self.manifest)
    }
}

/// The four repositories pre-seeded by AgentHub D01.
pub fn preset_git_sources() -> Vec<GitSourceAdapter> {
    [
        "https://github.com/anthropics/skills.git",
        "https://github.com/mattpocock/skills.git",
        "https://github.com/obra/superpowers.git",
        "https://github.com/affaan-m/ECC.git",
    ]
    .into_iter()
    .filter_map(|url| GitLocator::new(url, None, None).ok())
    .map(|locator| {
        let mut adapter = GitSourceAdapter::new(locator);
        adapter.metadata.kind = SourceKind::PresetGit;
        adapter
    })
    .collect()
}

fn scan_directory(root: &Path, source: SourceMetadata) -> Result<SourceScan, SourceError> {
    let root_metadata = fs::symlink_metadata(root)?;
    if root_metadata.file_type().is_symlink() || !root_metadata.is_dir() {
        return Err(SourceError::NotDirectory(root.to_path_buf()));
    }
    let mut skills = Vec::new();
    let mut diagnostics = Vec::new();
    let mut budget = ScanBudget::default();
    walk_skill_files(
        root,
        root,
        0,
        &source,
        &mut skills,
        &mut diagnostics,
        &mut budget,
    )?;
    if skills.is_empty() {
        diagnostics.push(SourceDiagnostic::warning(
            "no-skills",
            "source contains no SKILL.md entrypoints",
            Some(root),
        ));
    }
    Ok(SourceScan {
        source,
        skills,
        catalog_entries: Vec::new(),
        diagnostics,
    })
}

#[derive(Default)]
struct ScanBudget {
    entries: usize,
    exhausted: bool,
}

fn walk_skill_files(
    root: &Path,
    directory: &Path,
    depth: usize,
    source: &SourceMetadata,
    skills: &mut Vec<DiscoveredSkill>,
    diagnostics: &mut Vec<SourceDiagnostic>,
    budget: &mut ScanBudget,
) -> Result<(), SourceError> {
    if depth > MAX_SCAN_DEPTH {
        diagnostics.push(SourceDiagnostic::warning(
            "scan-depth-exceeded",
            format!("directory depth exceeds safety limit of {MAX_SCAN_DEPTH}"),
            Some(directory),
        ));
        return Ok(());
    }
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) => {
            diagnostics.push(SourceDiagnostic::error(
                "directory-unreadable",
                error.to_string(),
                Some(directory),
            ));
            return Ok(());
        }
    };
    for entry in entries {
        if budget.entries >= MAX_SCAN_ENTRIES {
            if !budget.exhausted {
                diagnostics.push(SourceDiagnostic::warning(
                    "scan-entry-limit-exceeded",
                    format!("source scan stopped after {MAX_SCAN_ENTRIES} entries"),
                    Some(directory),
                ));
                budget.exhausted = true;
            }
            return Ok(());
        }
        budget.entries += 1;
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                diagnostics.push(SourceDiagnostic::error(
                    "directory-entry-unreadable",
                    error.to_string(),
                    Some(directory),
                ));
                continue;
            }
        };
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                diagnostics.push(SourceDiagnostic::error(
                    "file-type-unreadable",
                    error.to_string(),
                    Some(&entry.path()),
                ));
                continue;
            }
        };
        if file_type.is_symlink() {
            let target_path = fs::read_link(entry.path()).ok().map(|target| {
                if target.is_absolute() {
                    target
                } else {
                    entry
                        .path()
                        .parent()
                        .map(|parent| parent.join(target.clone()))
                        .unwrap_or(target)
                }
            });
            let target_display = target_path
                .as_ref()
                .map(|path| path.to_string_lossy().into_owned());
            diagnostics.push(SourceDiagnostic::warning(
                "symlink-skipped",
                target_display
                    .as_deref()
                    .map(|target| format!("软链接入口已跳过；真实 Skill 路径：{target}"))
                    .unwrap_or_else(|| "软链接入口已跳过，无法读取真实 Skill 路径".into()),
                Some(&entry.path()),
            ));
            if let Some(last) = diagnostics.last_mut() {
                last.target_path = target_display;
            }
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            let name = entry.file_name();
            if matches!(name.to_str(), Some(".git" | "node_modules" | "target")) {
                continue;
            }
            walk_skill_files(root, &path, depth + 1, source, skills, diagnostics, budget)?;
        } else if file_type.is_file() && entry.file_name() == SKILL_FILE {
            skills.push(parse_skill(root, &path, source.clone()));
        }
    }
    Ok(())
}

fn parse_skill(root: &Path, entrypoint: &Path, source: SourceMetadata) -> DiscoveredSkill {
    let relative_dir = entrypoint
        .parent()
        .and_then(|path| path.strip_prefix(root).ok())
        .map(path_string)
        .unwrap_or_default();
    let display_name = entrypoint
        .parent()
        .and_then(Path::file_name)
        .and_then(|name| name.to_str())
        .unwrap_or(SKILL_FILE)
        .to_owned();
    let relative_entrypoint = entrypoint
        .strip_prefix(root)
        .map(path_string)
        .unwrap_or_else(|_| SKILL_FILE.to_owned());
    let mut result = DiscoveredSkill {
        source,
        relative_path: relative_dir,
        entrypoint_path: relative_entrypoint,
        source_directory: entrypoint.parent().unwrap_or(root).to_path_buf(),
        display_name,
        name: None,
        description: None,
        license: None,
        compatibility: None,
        metadata: BTreeMap::new(),
        raw_frontmatter: None,
        installable: false,
        diagnostics: Vec::new(),
    };

    let bytes = match fs::metadata(entrypoint).and_then(|metadata| {
        if metadata.len() > MAX_SKILL_BYTES {
            Err(std::io::Error::other("SKILL.md exceeds 1 MiB limit"))
        } else {
            fs::read(entrypoint)
        }
    }) {
        Ok(bytes) => bytes,
        Err(error) => {
            result.diagnostics.push(SourceDiagnostic::error(
                "entrypoint-unreadable",
                error.to_string(),
                Some(entrypoint),
            ));
            return result;
        }
    };
    let content = match String::from_utf8(bytes) {
        Ok(content) => content,
        Err(_) => {
            result.diagnostics.push(SourceDiagnostic::error(
                "entrypoint-not-utf8",
                "SKILL.md must be UTF-8",
                Some(entrypoint),
            ));
            return result;
        }
    };
    let Some((frontmatter, _body)) = split_frontmatter(&content) else {
        result.diagnostics.push(SourceDiagnostic::error(
            "frontmatter-missing",
            "SKILL.md must begin with YAML frontmatter",
            Some(entrypoint),
        ));
        return result;
    };
    result.raw_frontmatter = Some(frontmatter.to_owned());
    parse_frontmatter(frontmatter, &mut result);
    let valid_name = result.name.as_deref().is_some_and(valid_skill_name);
    if !valid_name {
        result.diagnostics.push(SourceDiagnostic::error(
            "name-invalid",
            "frontmatter name must be 1-64 lowercase alphanumeric characters or single hyphens",
            Some(entrypoint),
        ));
    } else if result.name.as_deref() != Some(result.display_name.as_str()) {
        result.diagnostics.push(SourceDiagnostic::error(
            "name-directory-mismatch",
            "frontmatter name must match the containing directory",
            Some(entrypoint),
        ));
    }
    if result.description.is_none() {
        result.diagnostics.push(SourceDiagnostic::error(
            "description-missing",
            "frontmatter description is required",
            Some(entrypoint),
        ));
    }
    result.installable = result.diagnostics.is_empty();
    result
}

fn parse_frontmatter(frontmatter: &str, skill: &mut DiscoveredSkill) {
    let mut in_metadata = false;
    for line in frontmatter.lines() {
        if line.trim().is_empty() {
            continue;
        }
        if line == "metadata:" {
            in_metadata = true;
            continue;
        }
        let Some((raw_key, raw_value)) = line.split_once(':') else {
            skill.diagnostics.push(SourceDiagnostic::error(
                "frontmatter-invalid",
                format!("frontmatter line has no ':' separator: {line}"),
                None,
            ));
            continue;
        };
        let key = raw_key.trim();
        let value = raw_value.trim().trim_matches(['"', '\'']);
        if in_metadata && line.starts_with(char::is_whitespace) {
            if !key.is_empty() {
                skill.metadata.insert(key.to_owned(), value.to_owned());
            }
            continue;
        }
        in_metadata = false;
        match key {
            "name" => skill.name = non_empty(value),
            "description" => skill.description = non_empty(value),
            "license" => skill.license = non_empty(value),
            "compatibility" => skill.compatibility = non_empty(value),
            "version" => {
                if let Some(version) = non_empty(value) {
                    skill.metadata.insert("version".into(), version);
                }
            }
            "metadata" => {}
            _ => {}
        }
    }
    if skill
        .description
        .as_ref()
        .is_some_and(|value| value.chars().count() > 1024)
    {
        skill.diagnostics.push(SourceDiagnostic::error(
            "description-too-long",
            "frontmatter description exceeds 1024 characters",
            None,
        ));
    }
}

fn parse_marketplace(manifest: &Path) -> Result<SourceScan, SourceError> {
    let bytes = fs::read(manifest)?;
    let root = marketplace_root(manifest)
        .ok_or_else(|| SourceError::InvalidLocator("manifest has no parent directory".into()))?;
    let source = SourceMetadata {
        kind: SourceKind::Marketplace,
        locator: path_string(root),
        manifest_path: Some(path_string(manifest)),
        requested_ref: None,
        resolved_commit: None,
    };
    let document: Value = serde_json::from_slice(&bytes).map_err(|error| {
        SourceError::InvalidLocator(format!("marketplace manifest is invalid JSON: {error}"))
    })?;
    let mut result = SourceScan {
        source: source.clone(),
        skills: Vec::new(),
        catalog_entries: Vec::new(),
        diagnostics: Vec::new(),
    };
    let Some(entries) = document.get("plugins").and_then(Value::as_array) else {
        result.diagnostics.push(SourceDiagnostic::error(
            "marketplace-plugins-missing",
            "marketplace.json requires a plugins array",
            Some(manifest),
        ));
        return Ok(result);
    };
    for entry in entries {
        let name = entry.get("name").and_then(Value::as_str).map(str::to_owned);
        let display_name = name.as_deref().unwrap_or("<unnamed>").to_owned();
        let mut catalog_entry = MarketplaceEntry {
            name,
            description: entry
                .get("description")
                .and_then(Value::as_str)
                .map(str::to_owned),
            version: entry
                .get("version")
                .and_then(Value::as_str)
                .map(str::to_owned),
            author: marketplace_author(entry.get("author")),
            homepage: entry
                .get("homepage")
                .and_then(Value::as_str)
                .map(str::to_owned),
            compatibility: entry.get("compatibility").cloned(),
            source: entry.get("source").cloned(),
            raw: entry.clone(),
            installable: false,
            diagnostics: Vec::new(),
        };
        let Some(raw_source) = entry.get("source") else {
            catalog_entry.diagnostics.push(SourceDiagnostic::error(
                "marketplace-source-missing",
                format!("marketplace entry '{display_name}' has no source"),
                Some(manifest),
            ));
            result.catalog_entries.push(catalog_entry);
            continue;
        };
        let Some(relative) = raw_source.as_str() else {
            catalog_entry.diagnostics.push(SourceDiagnostic::warning(
                "marketplace-source-unresolved",
                format!(
                    "marketplace entry '{display_name}' uses a non-local source; fetch is deferred"
                ),
                Some(manifest),
            ));
            result.catalog_entries.push(catalog_entry);
            continue;
        };
        let candidate = root.join(relative);
        if !is_safe_relative_path(Path::new(relative)) {
            catalog_entry.diagnostics.push(SourceDiagnostic::error(
                "marketplace-source-escapes-root",
                format!("marketplace entry '{display_name}' points outside the manifest directory"),
                Some(manifest),
            ));
            result.catalog_entries.push(catalog_entry);
            continue;
        }
        let entry_source = SourceMetadata {
            kind: SourceKind::Marketplace,
            locator: path_string(root),
            manifest_path: Some(path_string(manifest)),
            requested_ref: None,
            resolved_commit: None,
        };
        match scan_directory(&candidate, entry_source) {
            Ok(scan) => {
                catalog_entry.installable = scan.skills.iter().any(|skill| skill.installable);
                if scan.skills.is_empty() {
                    catalog_entry.diagnostics.extend(scan.diagnostics);
                } else {
                    result.skills.extend(scan.skills);
                    catalog_entry.diagnostics.extend(scan.diagnostics);
                }
            }
            Err(error) => catalog_entry.diagnostics.push(SourceDiagnostic::error(
                "marketplace-source-unreadable",
                error.to_string(),
                Some(&candidate),
            )),
        }
        result.catalog_entries.push(catalog_entry);
    }
    for entry in &result.catalog_entries {
        result.diagnostics.extend(entry.diagnostics.clone());
    }
    Ok(result)
}

fn split_frontmatter(content: &str) -> Option<(&str, &str)> {
    let content = content
        .strip_prefix("---\n")
        .or_else(|| content.strip_prefix("---\r\n"))?;
    let end = content.find("\n---")?;
    Some((&content[..end], &content[end + 4..]))
}

fn valid_skill_name(name: &str) -> bool {
    let length = name.chars().count();
    length > 0
        && length <= 64
        && !name.starts_with('-')
        && !name.ends_with('-')
        && !name.contains("--")
        && name.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
}

fn marketplace_author(author: Option<&Value>) -> Option<String> {
    author.and_then(|value| {
        value
            .as_str()
            .map(str::to_owned)
            .or_else(|| value.get("name").and_then(Value::as_str).map(str::to_owned))
    })
}

fn marketplace_root(manifest: &Path) -> Option<&Path> {
    let parent = manifest.parent()?;
    Some(
        if parent.file_name().and_then(|name| name.to_str()) == Some(".claude-plugin") {
            parent.parent().unwrap_or(parent)
        } else {
            parent
        },
    )
}

fn is_safe_relative_path(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
}

fn valid_git_ref(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && !value.ends_with('.')
        && !value.ends_with('/')
        && !value.ends_with(".lock")
        && !value.contains("..")
        && !value.contains("@{")
        && !value
            .chars()
            .any(|character| character.is_ascii_control() || character.is_whitespace())
        && !value
            .chars()
            .any(|character| matches!(character, '\\' | '~' | '^' | ':' | '?' | '*' | '['))
}

fn isolated_git_command() -> Command {
    let mut command = Command::new("git");
    command
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        )
        .env_remove("GIT_CONFIG_COUNT")
        .env_remove("GIT_CONFIG_PARAMETERS")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_OBJECT_DIRECTORY")
        .env_remove("GIT_ALTERNATE_OBJECT_DIRECTORIES")
        .env_remove("GIT_ASKPASS")
        .env_remove("SSH_ASKPASS")
        .env_remove("GIT_SSH_COMMAND");
    command
}

fn classify_git_clone_failure(code: i32, stderr: &str) -> SourceError {
    let stderr = stderr.to_ascii_lowercase();
    if stderr.contains("429")
        || stderr.contains("rate limit")
        || stderr.contains("too many requests")
    {
        SourceError::GitRateLimited
    } else if stderr.contains("unable to access")
        || stderr.contains("could not resolve")
        || stderr.contains("failed to connect")
        || stderr.contains("network")
    {
        SourceError::GitNetworkFailure
    } else {
        SourceError::GitCheckoutFailed {
            operation: "clone",
            code,
        }
    }
}

fn unique_sibling(parent: &Path, prefix: &str) -> Result<PathBuf, SourceError> {
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    for attempt in 0..128_u32 {
        let candidate = parent.join(format!("{prefix}-{seed}-{attempt}"));
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(SourceError::Io(error)),
        }
    }
    Err(SourceError::InvalidLocator(
        "could not allocate a unique Git staging directory".into(),
    ))
}

fn unused_destination(parent: &Path, prefix: &str) -> Result<PathBuf, SourceError> {
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    (0..128_u32)
        .map(|attempt| parent.join(format!("{prefix}-{seed}-{attempt}")))
        .find(|candidate| !candidate.exists())
        .ok_or_else(|| {
            SourceError::InvalidLocator("could not allocate a unique checkout path".into())
        })
}

fn authorized_directory(path: &Path) -> Result<PathBuf, SourceError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(SourceError::NotDirectory(path.to_path_buf()));
    }
    Ok(path.canonicalize()?)
}

fn non_empty(value: &str) -> Option<String> {
    (!value.is_empty()).then(|| value.to_owned())
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    use std::os::unix::fs::{symlink, PermissionsExt};
    use tempfile::tempdir;

    fn write_skill(root: &Path, name: &str, body: &str) {
        let directory = root.join(name);
        fs::create_dir_all(&directory).expect("skill directory created");
        fs::write(directory.join(SKILL_FILE), body).expect("skill written");
    }

    #[test]
    fn scans_valid_local_skill_without_executing_files() {
        let directory = tempdir().expect("tempdir");
        write_skill(
            directory.path(),
            "review",
            "---\nname: review\ndescription: Review changes\nmetadata:\n  author: team\n---\n#!/bin/sh\ntouch SHOULD_NOT_EXIST\n",
        );
        let result = LocalSourceAdapter::new(directory.path())
            .scan()
            .expect("scan succeeds");
        assert_eq!(result.skills.len(), 1);
        assert!(result.skills[0].installable);
        assert_eq!(result.skills[0].metadata["author"], "team");
        assert!(!directory.path().join("review/SHOULD_NOT_EXIST").exists());
    }

    #[test]
    fn invalid_name_and_missing_description_are_visible_but_not_installable() {
        let directory = tempdir().expect("tempdir");
        write_skill(directory.path(), "Bad_Name", "---\nname: Bad_Name\n---\n");
        let result = LocalSourceAdapter::new(directory.path())
            .scan()
            .expect("scan succeeds");
        let skill = &result.skills[0];
        assert!(!skill.installable);
        assert!(skill
            .diagnostics
            .iter()
            .any(|item| item.code == "name-invalid"));
        assert!(skill
            .diagnostics
            .iter()
            .any(|item| item.code == "description-missing"));
    }

    #[test]
    #[cfg(unix)]
    fn skips_symlinked_skill_directories() {
        let directory = tempdir().expect("tempdir");
        let outside = tempdir().expect("outside");
        write_skill(
            outside.path(),
            "outside",
            "---\nname: outside\ndescription: no\n---\n",
        );
        symlink(
            outside.path().join("outside"),
            directory.path().join("linked"),
        )
        .expect("symlink created");
        let result = LocalSourceAdapter::new(directory.path())
            .scan()
            .expect("scan succeeds");
        assert!(result.skills.is_empty());
        assert!(result
            .diagnostics
            .iter()
            .any(|item| item.code == "symlink-skipped"));
        let expected_target = path_string(&outside.path().join("outside"));
        assert_eq!(
            result
                .diagnostics
                .iter()
                .find(|item| item.code == "symlink-skipped")
                .and_then(|item| item.target_path.as_deref()),
            Some(expected_target.as_str())
        );
    }

    #[test]
    fn marketplace_local_entry_is_scanned_and_escape_is_rejected() {
        let directory = tempdir().expect("tempdir");
        write_skill(
            directory.path().join("plugins").as_path(),
            "review",
            "---\nname: review\ndescription: Review changes\n---\n",
        );
        fs::create_dir_all(directory.path().join(".claude-plugin"))
            .expect("manifest directory created");
        let manifest = directory.path().join(".claude-plugin/marketplace.json");
        fs::write(
            &manifest,
            r#"{"name":"test","plugins":[{"name":"review","description":"Review changes","version":"1.0.0","author":{"name":"Team"},"source":"plugins/review"},{"name":"remote","source":{"source":"github","repo":"example/skills"}},{"name":"bad","source":"../outside"}]}"#,
        )
        .expect("manifest written");
        let result = MarketplaceSourceAdapter::new(&manifest)
            .scan()
            .expect("manifest parses");
        assert_eq!(result.skills.len(), 1);
        assert!(result.skills[0].installable);
        assert_eq!(result.catalog_entries.len(), 3);
        assert!(result.catalog_entries[0].installable);
        assert_eq!(result.catalog_entries[0].author.as_deref(), Some("Team"));
        assert!(result.catalog_entries[1]
            .diagnostics
            .iter()
            .any(|item| item.code == "marketplace-source-unresolved"));
        assert!(result.catalog_entries[2]
            .diagnostics
            .iter()
            .any(|item| item.code == "marketplace-source-escapes-root"));
    }

    #[test]
    fn source_locators_are_validated_without_network_access() {
        assert!(GitLocator::new("file:///tmp/repo", None, None).is_err());
        let git = GitLocator::new(
            "https://github.com/example/repo.git",
            Some("main".into()),
            Some("skills".into()),
        )
        .expect("git locator");
        assert!(GitSourceAdapter::new(git).scan().is_err());
        assert!(SkillsShSourceAdapter::new("anthropics/skills").is_ok());
        assert!(SkillsShSourceAdapter::new("https://example.invalid").is_err());
    }

    #[test]
    fn preset_repositories_are_stable() {
        let sources = preset_git_sources();
        assert_eq!(sources.len(), 4);
        assert!(sources
            .iter()
            .any(|source| source.metadata().locator.contains("anthropics/skills")));
    }

    fn run_git(directory: &Path, arguments: &[&str]) {
        let status = Command::new("git")
            .arg("-C")
            .arg(directory)
            .args(arguments)
            .status()
            .expect("git starts");
        assert!(status.success(), "git {:?} succeeds", arguments);
    }

    fn git_repository() -> tempfile::TempDir {
        let repository = tempdir().expect("repository");
        run_git(repository.path(), &["init"]);
        run_git(repository.path(), &["config", "user.name", "AgentHub Test"]);
        run_git(
            repository.path(),
            &["config", "user.email", "agenthub@example.invalid"],
        );
        write_skill(
            repository.path(),
            "review",
            "---\nname: review\ndescription: Review changes\ncompatibility: Claude, Codex, OpenCode\n---\n# Review\n",
        );
        run_git(repository.path(), &["add", "."]);
        run_git(repository.path(), &["commit", "-m", "fixture"]);
        repository
    }

    fn local_git_locator(repository: &Path, requested_ref: Option<String>) -> GitLocator {
        GitLocator {
            url: format!("file://{}", repository.to_string_lossy()),
            requested_ref,
            subdirectory: None,
        }
    }

    #[test]
    fn git_fetch_is_staged_traceable_and_cleans_up_after_an_invalid_ref() {
        let repository = git_repository();
        let cache = tempdir().expect("cache");
        let destination = cache.path().join("checkout");
        let adapter =
            GitSourceAdapter::fetch(local_git_locator(repository.path(), None), &destination)
                .expect("repository fetches");
        let scan = adapter.scan().expect("checkout scans");
        assert_eq!(scan.skills.len(), 1);
        assert_eq!(scan.skills[0].relative_path, "review");
        assert!(adapter
            .metadata()
            .resolved_commit
            .as_deref()
            .is_some_and(|commit| commit.len() >= 40
                && commit.chars().all(|value| value.is_ascii_hexdigit())));

        let bad_destination = cache.path().join("bad-checkout");
        let error = GitSourceAdapter::fetch(
            local_git_locator(repository.path(), Some("missing-ref".into())),
            &bad_destination,
        )
        .expect_err("unknown ref fails");
        assert!(matches!(error, SourceError::GitReferenceUnavailable));
        assert!(!bad_destination.exists());
        assert!(fs::read_dir(cache.path())
            .expect("cache lists")
            .flatten()
            .all(|entry| !entry.file_name().to_string_lossy().contains("staging")));
    }

    #[test]
    #[cfg(unix)]
    fn repository_hooks_are_not_executed_during_fetch() {
        let repository = git_repository();
        let cache = tempdir().expect("cache");
        let sentinel = cache.path().join("hook-executed");
        let hook = repository.path().join(".git/hooks/post-checkout");
        fs::write(
            &hook,
            format!("#!/bin/sh\ntouch '{}'\n", sentinel.to_string_lossy()),
        )
        .expect("hook written");
        let mut permissions = fs::metadata(&hook).expect("hook metadata").permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&hook, permissions).expect("hook executable");

        GitSourceAdapter::fetch(
            local_git_locator(repository.path(), None),
            cache.path().join("checkout"),
        )
        .expect("repository fetches");
        assert!(!sentinel.exists());
    }

    #[test]
    fn invalid_git_input_and_network_failure_leave_no_checkout() {
        assert!(
            GitLocator::new("https://example.invalid/repo", Some("--help".into()), None).is_err()
        );
        assert!(GitLocator::new(
            "https://example.invalid/repo",
            None,
            Some("../outside".into())
        )
        .is_err());
        let cache = tempdir().expect("cache");
        let destination = cache.path().join("network-failure");
        let locator = GitLocator::new("http://127.0.0.1:9/unavailable.git", None, None)
            .expect("locator is structurally valid");
        assert!(matches!(
            GitSourceAdapter::fetch(locator, &destination),
            Err(SourceError::GitNetworkFailure)
        ));
        assert!(!destination.exists());
        assert!(matches!(
            classify_git_clone_failure(128, "remote: HTTP 429 rate limit exceeded"),
            SourceError::GitRateLimited
        ));
    }

    #[test]
    fn local_and_marketplace_sources_require_explicit_path_authorization() {
        let source = tempdir().expect("source");
        let cache = tempdir().expect("cache");
        write_skill(
            source.path(),
            "review",
            "---\nname: review\ndescription: Review changes\n---\n",
        );
        fs::create_dir_all(source.path().join(".claude-plugin")).expect("manifest directory");
        let manifest = source.path().join(".claude-plugin/marketplace.json");
        fs::write(
            &manifest,
            r#"{"plugins":[{"name":"review","source":"review"}]}"#,
        )
        .expect("manifest");
        let manager = SkillSourceManager::new(cache.path());
        assert!(matches!(
            manager.scan_authorized_local(source.path()),
            Err(SourceError::Unauthorized(_))
        ));
        manager
            .authorize_and_scan_local(source.path())
            .expect("directory authorized");
        assert_eq!(
            manager
                .scan_authorized_marketplace(&manifest)
                .expect("authorized manifest scans")
                .catalog_entries
                .len(),
            1
        );
    }

    #[test]
    fn marketplace_preserves_optional_fields_and_resolves_standard_github_source() {
        let entry = MarketplaceEntry {
            name: Some("review".into()),
            description: Some("Review changes".into()),
            version: Some("1.2.3".into()),
            author: Some("Team".into()),
            homepage: None,
            compatibility: Some(serde_json::json!(["claude-code", "codex"])),
            source: Some(serde_json::json!({
                "source": "github",
                "repo": "anthropics/skills",
                "ref": "main",
                "path": "skills/review"
            })),
            raw: serde_json::json!({"futureField": true}),
            installable: false,
            diagnostics: Vec::new(),
        };
        let locator = marketplace_git_locator(&entry)
            .expect("source resolves")
            .expect("Git source");
        assert_eq!(locator.url, "https://github.com/anthropics/skills.git");
        assert_eq!(locator.requested_ref.as_deref(), Some("main"));
        assert_eq!(locator.subdirectory.as_deref(), Some("skills/review"));
        assert_eq!(entry.raw["futureField"], true);
    }

    #[test]
    fn skills_sh_fixed_locator_forms_produce_the_same_unified_source() {
        let repository = git_repository();
        let pair = SkillsShSourceAdapter::new("anthropics/skills").expect("pair");
        let url =
            SkillsShSourceAdapter::new("https://skills.sh/anthropics/skills").expect("catalog URL");
        assert_eq!(pair.metadata(), url.metadata());
        let scan = pair
            .from_checkout(repository.path())
            .scan()
            .expect("fixed checkout response scans");
        assert_eq!(scan.source.kind, SourceKind::SkillsSh);
        assert_eq!(scan.skills[0].name.as_deref(), Some("review"));
    }
}
