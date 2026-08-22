//! Read-only Skill source discovery.
//!
//! This module deliberately does not clone repositories, execute scripts, follow
//! symlinks, or mutate a source directory. Git and skills.sh adapters can scan a
//! caller-provided checkout; fetching is a later, separately-authorized concern.

use std::{
    collections::BTreeMap,
    fs,
    path::{Component, Path, PathBuf},
    process::Command,
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

const SKILL_FILE: &str = "SKILL.md";
const MAX_SKILL_BYTES: u64 = 1024 * 1024;
const MAX_SCAN_DEPTH: usize = 32;
const MAX_SCAN_ENTRIES: usize = 100_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SourceKind {
    PresetGit,
    Git,
    Local,
    Marketplace,
    SkillsSh,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
pub struct SourceDiagnostic {
    pub code: String,
    pub message: String,
    pub severity: DiagnosticSeverity,
    pub path: Option<String>,
}

impl SourceDiagnostic {
    fn error(code: &str, message: impl Into<String>, path: Option<&Path>) -> Self {
        Self {
            code: code.to_owned(),
            message: message.into(),
            severity: DiagnosticSeverity::Error,
            path: path.map(path_string),
        }
    }

    fn warning(code: &str, message: impl Into<String>, path: Option<&Path>) -> Self {
        Self {
            code: code.to_owned(),
            message: message.into(),
            severity: DiagnosticSeverity::Warning,
            path: path.map(path_string),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiscoveredSkill {
    pub source: SourceMetadata,
    pub relative_path: String,
    pub entrypoint_path: String,
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
    pub display_name: String,
    pub relative_path: String,
    pub source_tracked: bool,
    pub diagnostics: Vec<SourceDiagnostic>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInventory {
    pub skills: Vec<InstalledSkill>,
    pub duplicate_names: Vec<String>,
    pub diagnostics: Vec<SourceDiagnostic>,
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
    };
    let mut names = BTreeMap::<String, usize>::new();
    for (agent, scope, root) in roots {
        if !root.exists() {
            continue;
        }
        match LocalSourceAdapter::new(&root).scan() {
            Ok(scan) => {
                for skill in scan.skills {
                    let key = skill
                        .name
                        .clone()
                        .unwrap_or_else(|| skill.display_name.clone());
                    *names.entry(key).or_default() += 1;
                    inventory.skills.push(InstalledSkill {
                        agent,
                        scope,
                        path: skill.entrypoint_path,
                        display_name: skill.display_name,
                        relative_path: skill.relative_path,
                        source_tracked: false,
                        diagnostics: skill.diagnostics,
                    });
                }
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
        .filter_map(|(name, count)| (count > 1).then_some(name))
        .collect();
    inventory
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarketplaceEntry {
    pub name: Option<String>,
    pub description: Option<String>,
    pub version: Option<String>,
    pub author: Option<String>,
    pub homepage: Option<String>,
    /// Preserves string and structured source forms without executing them.
    pub source: Option<Value>,
    pub installable: bool,
    pub diagnostics: Vec<SourceDiagnostic>,
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
    #[error("git checkout failed with exit code {0}")]
    GitCheckoutFailed(i32),
}

/// The only seam required by inventory and future installation planning.
pub trait SkillSourceAdapter: Send + Sync {
    fn metadata(&self) -> &SourceMetadata;
    fn scan(&self) -> Result<SourceScan, SourceError>;
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
        if destination.exists()
            && fs::read_dir(&destination)
                .map_err(SourceError::Io)?
                .next()
                .is_some()
        {
            return Err(SourceError::InvalidLocator(
                "Git destination must be empty".into(),
            ));
        }
        let parent = destination
            .parent()
            .ok_or_else(|| SourceError::InvalidLocator("Git destination has no parent".into()))?;
        fs::create_dir_all(parent)?;
        let hooks_directory = parent.join(".agent-hub-empty-hooks");
        fs::create_dir_all(&hooks_directory)?;
        let hooks_config = format!("core.hooksPath={}", path_string(&hooks_directory));
        let mut clone = Command::new("git");
        clone
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .arg("-c")
            .arg(&hooks_config)
            .arg("clone")
            .arg("--no-recurse-submodules")
            .arg(&locator.url)
            .arg(&destination);
        let status = clone.status().map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                SourceError::GitUnavailable
            } else {
                SourceError::Io(error)
            }
        })?;
        if !status.success() {
            return Err(SourceError::GitCheckoutFailed(status.code().unwrap_or(-1)));
        }
        if let Some(reference) = locator.requested_ref.as_deref() {
            let status = Command::new("git")
                .env("GIT_TERMINAL_PROMPT", "0")
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .arg("-c")
                .arg(&hooks_config)
                .arg("-C")
                .arg(&destination)
                .args(["checkout", "--detach", reference])
                .status()
                .map_err(SourceError::Io)?;
            if !status.success() {
                return Err(SourceError::GitCheckoutFailed(status.code().unwrap_or(-1)));
            }
        }
        let output = Command::new("git")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .arg("-C")
            .arg(&destination)
            .args(["rev-parse", "HEAD"])
            .output()
            .map_err(SourceError::Io)?;
        if !output.status.success() {
            return Err(SourceError::GitCheckoutFailed(
                output.status.code().unwrap_or(-1),
            ));
        }
        let commit = String::from_utf8_lossy(&output.stdout).trim().to_owned();
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
            diagnostics.push(SourceDiagnostic::warning(
                "symlink-skipped",
                "symlink was skipped during read-only discovery",
                Some(&entry.path()),
            ));
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
            source: entry.get("source").cloned(),
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
    use std::os::unix::fs::symlink;
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
}
