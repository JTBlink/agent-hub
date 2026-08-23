use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::Manager;

use agents::{claude::ClaudeCodeAdapter, AgentConfigAdapter, ConfigDocument, ScanContext};
use persistence::{
    ConfigMetadataRepository, SkillRepository, StorageDiagnosticsRepository, WorkspaceRepository,
};

pub mod agents;
pub mod configuration;
pub mod diagnostics;
pub mod domain;
pub mod logging;
pub mod persistence;
pub mod skill_installation;
pub mod skills;

pub use domain::{Agent, ConfigFormat, InstallationState, ParseStatus, Scope, SkillKind};

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: &'static str,
    version: &'static str,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "AgentHub",
        version: env!("CARGO_PKG_VERSION"),
    }
}

struct AppState {
    workspaces: Arc<dyn WorkspaceRepository>,
    config_metadata: Arc<dyn ConfigMetadataRepository>,
    storage_diagnostics: Arc<dyn StorageDiagnosticsRepository>,
    authorized_config_paths: Mutex<HashMap<PathBuf, AuthorizedConfig>>,
    #[allow(dead_code)]
    recovery_registry: Mutex<diagnostics::RecoveryRegistry>,
    backup_root: PathBuf,
    skill_repository: Option<Arc<dyn SkillRepository>>,
    skill_sources: Option<Arc<skills::SkillSourceManager>>,
    pending_skill_plans: Mutex<HashMap<String, PendingSkillPlan>>,
}

#[derive(Debug, Clone)]
struct PendingSkillPlan {
    plan: skill_installation::InstallPlan,
    skill: skills::DiscoveredSkill,
    context: skill_installation::SkillTargetContext,
    workspace_id: Option<i64>,
    created_at: SystemTime,
}

const MAX_PENDING_SKILL_PLANS: usize = 256;
const PENDING_SKILL_PLAN_TTL: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Clone, Copy)]
struct AuthorizedConfig {
    id: i64,
    format: ConfigFormat,
}

impl AppState {
    fn new(
        workspaces: Arc<dyn WorkspaceRepository>,
        config_metadata: Arc<dyn ConfigMetadataRepository>,
        storage_diagnostics: Arc<dyn StorageDiagnosticsRepository>,
        backup_root: PathBuf,
    ) -> Self {
        Self {
            workspaces,
            config_metadata,
            storage_diagnostics,
            authorized_config_paths: Mutex::new(HashMap::new()),
            recovery_registry: Mutex::new(diagnostics::RecoveryRegistry::default()),
            backup_root,
            skill_repository: None,
            skill_sources: None,
            pending_skill_plans: Mutex::new(HashMap::new()),
        }
    }

    fn configure_skill_services(
        &mut self,
        repository: Arc<dyn SkillRepository>,
        sources: Arc<skills::SkillSourceManager>,
    ) {
        self.skill_repository = Some(repository);
        self.skill_sources = Some(sources);
    }

    fn skill_repository(&self) -> Result<&Arc<dyn SkillRepository>, String> {
        self.skill_repository
            .as_ref()
            .ok_or_else(|| "Skill storage is not configured".to_owned())
    }

    fn skill_sources(&self) -> Result<&Arc<skills::SkillSourceManager>, String> {
        self.skill_sources
            .as_ref()
            .ok_or_else(|| "Skill source manager is not configured".to_owned())
    }

    fn store_pending_skill_plan(
        &self,
        plan_id: String,
        pending: PendingSkillPlan,
    ) -> Result<(), String> {
        let mut plans = self
            .pending_skill_plans
            .lock()
            .map_err(|_| "Skill install plan store is unavailable".to_owned())?;
        prune_pending_skill_plans(&mut plans);
        if plans.len() >= MAX_PENDING_SKILL_PLANS {
            if let Some(oldest_id) = plans
                .iter()
                .min_by_key(|(_, value)| value.created_at)
                .map(|(id, _)| id.clone())
            {
                plans.remove(&oldest_id);
            }
        }
        plans.insert(plan_id, pending);
        Ok(())
    }

    fn take_pending_skill_plan(&self, plan_id: &str) -> Result<PendingSkillPlan, String> {
        let mut plans = self
            .pending_skill_plans
            .lock()
            .map_err(|_| "Skill install plan store is unavailable".to_owned())?;
        prune_pending_skill_plans(&mut plans);
        plans
            .remove(plan_id)
            .ok_or_else(|| "Skill install plan has expired or was not confirmed".to_owned())
    }

    fn authorize(&self, document: &ConfigDocument, id: i64) -> Result<(), String> {
        self.authorized_config_paths
            .lock()
            .map_err(|_| "configuration authorization lock is unavailable".to_owned())?
            .insert(
                document.path.clone(),
                AuthorizedConfig {
                    id,
                    format: document.format,
                },
            );
        Ok(())
    }

    fn authorization(&self, path: &Path) -> Result<AuthorizedConfig, String> {
        let authorized = self
            .authorized_config_paths
            .lock()
            .map_err(|_| "configuration authorization lock is unavailable".to_owned())?;
        authorized
            .get(path)
            .copied()
            .ok_or_else(|| "configuration path must be discovered before it can be edited".into())
    }

    fn revoke_config_ids(&self, ids: &[i64]) -> Result<(), String> {
        self.authorized_config_paths
            .lock()
            .map_err(|_| "configuration authorization lock is unavailable".to_owned())?
            .retain(|_, authorization| !ids.contains(&authorization.id));
        Ok(())
    }
}

fn prune_pending_skill_plans(plans: &mut HashMap<String, PendingSkillPlan>) {
    let now = SystemTime::now();
    plans.retain(|_, pending| {
        now.duration_since(pending.created_at)
            .map(|age| age < PENDING_SKILL_PLAN_TTL)
            .unwrap_or(true)
    });
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceScanResult {
    workspace: persistence::WorkspaceRecord,
    configs: Vec<ConfigDocument>,
    skills: skills::SkillInventory,
    instructions: Vec<InstructionFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstructionFile {
    path: String,
    kind: String,
    scope: Scope,
}

fn discover_instruction_files(root: &Path) -> Vec<InstructionFile> {
    const MAX_DEPTH: usize = 16;
    const MAX_ENTRIES: usize = 20_000;
    const MAX_INSTRUCTION_FILES: usize = 500;
    discover_instruction_files_with_limits(root, MAX_DEPTH, MAX_ENTRIES, MAX_INSTRUCTION_FILES)
}

fn discover_instruction_files_with_limits(
    root: &Path,
    max_depth: usize,
    max_entries: usize,
    max_instruction_files: usize,
) -> Vec<InstructionFile> {
    fn ignored_directory(path: &Path) -> bool {
        path.file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| {
                matches!(
                    name,
                    ".git"
                        | ".hg"
                        | ".svn"
                        | ".next"
                        | ".venv"
                        | "build"
                        | "dist"
                        | "node_modules"
                        | "target"
                        | "vendor"
                )
            })
    }

    fn visit(
        directory: &Path,
        depth: usize,
        max_depth: usize,
        remaining_entries: &mut usize,
        max_instruction_files: usize,
        found: &mut Vec<InstructionFile>,
    ) {
        if depth > max_depth || *remaining_entries == 0 || found.len() >= max_instruction_files {
            return;
        }
        let Ok(entries) = std::fs::read_dir(directory) else {
            return;
        };
        let mut entries = entries.flatten().collect::<Vec<_>>();
        entries.sort_by_key(std::fs::DirEntry::file_name);
        for entry in entries {
            if *remaining_entries == 0 || found.len() >= max_instruction_files {
                return;
            }
            *remaining_entries -= 1;
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                if !ignored_directory(&path) {
                    visit(
                        &path,
                        depth + 1,
                        max_depth,
                        remaining_entries,
                        max_instruction_files,
                        found,
                    );
                }
                continue;
            }
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            let kind = match name {
                "AGENTS.md" | "AGENTS.override.md" => "agents",
                "CLAUDE.md" | "CLAUDE.local.md" => "claude",
                _ => continue,
            };
            found.push(InstructionFile {
                path: path.to_string_lossy().into_owned(),
                kind: kind.to_owned(),
                scope: Scope::Workspace,
            });
        }
    }
    let mut found = Vec::new();
    let mut remaining_entries = max_entries;
    visit(
        root,
        0,
        max_depth,
        &mut remaining_entries,
        max_instruction_files,
        &mut found,
    );
    found.sort_by(|left, right| left.path.cmp(&right.path));
    found
}

fn workspace_input(path: &str) -> Result<persistence::NewWorkspace, String> {
    let entered_path = path.trim();
    if entered_path.is_empty() {
        return Err("workspace path cannot be empty".into());
    }
    let entered = PathBuf::from(entered_path);
    let metadata = std::fs::symlink_metadata(&entered)
        .map_err(|error| format!("workspace path is unavailable: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("workspace path must be a real directory, not a symlink".into());
    }
    let canonical = entered
        .canonicalize()
        .map_err(|error| format!("workspace path cannot be canonicalized: {error}"))?;
    let normalized_path = canonical.to_string_lossy().into_owned();
    let display_name = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("Workspace")
        .to_owned();
    Ok(persistence::NewWorkspace {
        display_name,
        entered_path: entered_path.to_owned(),
        normalized_path: normalized_path.clone(),
        canonical_path: Some(normalized_path),
    })
}

fn config_index(document: &ConfigDocument) -> persistence::ConfigIndex {
    persistence::ConfigIndex {
        agent: document.agent,
        scope: document.scope,
        normalized_path: document.path.to_string_lossy().into_owned(),
        format: document.format,
        checksum: document.checksum.clone().unwrap_or_default(),
        parse_status: match document.status {
            agents::ConfigStatus::Ready => ParseStatus::Valid,
            agents::ConfigStatus::Invalid => ParseStatus::Invalid,
            agents::ConfigStatus::Missing => ParseStatus::Missing,
            agents::ConfigStatus::Unreadable => ParseStatus::Unreadable,
        },
    }
}

fn register_global_config(state: &AppState, document: &ConfigDocument) -> Result<(), String> {
    let id = state
        .config_metadata
        .upsert_config_index(None, &config_index(document))
        .map_err(|error| error.to_string())?;
    state.authorize(document, id)
}

#[tauri::command]
fn list_workspaces(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<persistence::WorkspaceRecord>, String> {
    state
        .workspaces
        .list_workspaces()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn add_workspace(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<persistence::WorkspaceRecord, String> {
    let workspace = workspace_input(&path)?;
    let id = state
        .workspaces
        .add_workspace(&workspace)
        .map_err(|error| error.to_string())?;
    state
        .workspaces
        .list_workspaces()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|item| item.id == id)
        .ok_or_else(|| "workspace was added but could not be loaded".to_owned())
}

#[tauri::command]
fn remove_workspace(workspace_id: i64, state: tauri::State<'_, AppState>) -> Result<bool, String> {
    remove_workspace_record(&state, workspace_id)
}

fn remove_workspace_record(state: &AppState, workspace_id: i64) -> Result<bool, String> {
    let config_ids = state
        .config_metadata
        .config_indexes(workspace_id)
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|record| record.id)
        .collect::<Vec<_>>();
    let removed = state
        .workspaces
        .remove_workspace(workspace_id)
        .map_err(|error| error.to_string())?;
    if removed {
        state.revoke_config_ids(&config_ids)?;
    }
    Ok(removed)
}

#[tauri::command]
fn scan_workspace(
    app: tauri::AppHandle,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<WorkspaceScanResult, String> {
    let workspace = workspace_input(&path)?;
    let root = PathBuf::from(&workspace.normalized_path);
    let configs = vec![
        ClaudeCodeAdapter.scan_workspace(&root),
        agents::standard::CodexAdapter.scan_workspace(&root),
        agents::standard::OpenCodeAdapter.scan_workspace(&root),
    ];
    let indexes = configs.iter().map(config_index).collect::<Vec<_>>();
    let workspace_id = state
        .workspaces
        .replace_workspace_scan(&workspace, &indexes)
        .map_err(|error| error.to_string())?;
    let workspace_record = state
        .workspaces
        .list_workspaces()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|item| item.id == workspace_id)
        .ok_or_else(|| "workspace scan completed but record could not be loaded".to_owned())?;
    let indexed_configs = state
        .config_metadata
        .config_indexes(workspace_id)
        .map_err(|error| error.to_string())?;
    for document in &configs {
        let normalized_path = document.path.to_string_lossy();
        let id = indexed_configs
            .iter()
            .find(|record| record.index.normalized_path == normalized_path)
            .map(|record| record.id)
            .ok_or_else(|| "workspace configuration index could not be loaded".to_owned())?;
        state.authorize(document, id)?;
    }
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    let inventory = skills::scan_installed_skills(home_directory, Some(&root));
    Ok(WorkspaceScanResult {
        workspace: workspace_record,
        configs,
        skills: inventory,
        instructions: discover_instruction_files(&root),
    })
}

#[tauri::command]
fn storage_diagnostics(
    state: tauri::State<'_, AppState>,
) -> Result<persistence::DatabaseDiagnostics, String> {
    match state.storage_diagnostics.diagnostics() {
        Ok(diagnostics) => Ok(diagnostics),
        Err(error) => {
            logging::command_failed(
                logging::Command::StorageDiagnostics,
                logging::FailureCode::Persistence,
            );
            Err(error.to_string())
        }
    }
}

#[tauri::command]
fn scan_claude_global(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ConfigDocument, String> {
    let home_directory = app
        .path()
        .home_dir()
        .map_err(|error| format!("could not resolve the user home directory: {error}"))?;
    let context = ScanContext::from_environment(home_directory);
    let document = ClaudeCodeAdapter.scan_global(&context);
    register_global_config(&state, &document)?;
    Ok(document)
}

#[tauri::command]
fn scan_codex_global(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ConfigDocument, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    let document =
        agents::standard::CodexAdapter.scan_global(&ScanContext::from_environment(home_directory));
    register_global_config(&state, &document)?;
    Ok(document)
}

#[tauri::command]
fn scan_opencode_global(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ConfigDocument, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    let document = agents::standard::OpenCodeAdapter
        .scan_global(&ScanContext::from_environment(home_directory));
    register_global_config(&state, &document)?;
    Ok(document)
}

#[tauri::command]
fn scan_skills(
    app: tauri::AppHandle,
    workspace_directory: Option<String>,
) -> Result<skills::SkillInventory, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    let workspace_directory = workspace_directory.map(PathBuf::from);
    Ok(skills::scan_installed_skills(
        home_directory,
        workspace_directory,
    ))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillInstallPlanPreview {
    plan_id: String,
    plan: skill_installation::InstallPlan,
    source: skills::SourceMetadata,
    display_name: String,
    description: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillInstallRequest {
    request: skills::SourceRequest,
    skill_path: String,
    agent: Agent,
    scope: Scope,
    #[serde(default)]
    workspace_directory: Option<String>,
    #[serde(default)]
    workspace_id: Option<i64>,
}

fn skill_target_context(
    home: impl AsRef<Path>,
    workspace_directory: Option<&str>,
) -> Result<skill_installation::SkillTargetContext, String> {
    let workspace = workspace_directory.map(PathBuf::from);
    skill_installation::SkillTargetContext::new(home, workspace.as_deref())
        .map_err(|error| error.to_string())
}

fn validated_skill_workspace(
    state: &AppState,
    scope: Scope,
    workspace_directory: Option<&str>,
    requested_workspace_id: Option<i64>,
) -> Result<(Option<String>, Option<i64>), String> {
    match scope {
        Scope::Global => {
            if workspace_directory.is_some() || requested_workspace_id.is_some() {
                return Err("global Skill operations cannot target a workspace".into());
            }
            Ok((None, None))
        }
        Scope::Workspace => {
            let path = workspace_directory.ok_or_else(|| {
                "workspace Skill operations require a workspace directory".to_owned()
            })?;
            let workspace = workspace_input(path)?;
            let record = state
                .workspaces
                .list_workspaces()
                .map_err(|error| error.to_string())?
                .into_iter()
                .find(|record| {
                    record.normalized_path == workspace.normalized_path
                        && requested_workspace_id.is_none_or(|id| record.id == id)
                })
                .ok_or_else(|| {
                    "workspace must be registered before managing its Skills".to_owned()
                })?;
            Ok((Some(record.normalized_path), Some(record.id)))
        }
    }
}

fn lifecycle_target_context(
    state: &AppState,
    home: impl AsRef<Path>,
    target_directory: &Path,
    workspace_directory: Option<&str>,
) -> Result<skill_installation::SkillTargetContext, String> {
    let installation = skill_installation::managed_installation(target_directory)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Skill is not managed by AgentHub".to_owned())?;
    let (workspace_directory, _) =
        validated_skill_workspace(state, installation.scope, workspace_directory, None)?;
    skill_target_context(home, workspace_directory.as_deref())
}

fn select_discovered_skill(
    source: &skills::SourceBrowseResult,
    requested_path: &str,
) -> Result<skills::DiscoveredSkill, String> {
    let requested_path = requested_path.trim().trim_matches('/');
    if requested_path.is_empty()
        || Path::new(requested_path)
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err("Skill relative path is invalid".into());
    }
    source
        .skills
        .iter()
        .find(|skill| skill.relative_path == requested_path || skill.display_name == requested_path)
        .cloned()
        .ok_or_else(|| "the requested source does not contain an installable Skill".into())
}

fn plan_identifier() -> String {
    static NEXT_PLAN_SEQUENCE: AtomicU64 = AtomicU64::new(1);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let sequence = NEXT_PLAN_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("plan-{timestamp}-{sequence}")
}

#[tauri::command]
fn browse_skill_source(
    state: tauri::State<'_, AppState>,
    request: skills::SourceRequest,
) -> Result<skills::SourceBrowseResult, String> {
    state.skill_sources()?.browse(request).map_err(|error| {
        logging::command_failed(
            logging::Command::BrowseSkillSource,
            logging::FailureCode::Skills,
        );
        error.to_string()
    })
}

#[tauri::command]
fn plan_skill_install(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: SkillInstallRequest,
) -> Result<SkillInstallPlanPreview, String> {
    let home = app.path().home_dir().map_err(|error| error.to_string())?;
    create_skill_install_plan_for_state(home, &state, input).inspect_err(|_| {
        logging::command_failed(
            logging::Command::PlanSkillInstall,
            logging::FailureCode::Skills,
        );
    })
}

fn create_skill_install_plan_for_state(
    home: impl AsRef<Path>,
    state: &AppState,
    input: SkillInstallRequest,
) -> Result<SkillInstallPlanPreview, String> {
    let (workspace_directory, workspace_id) = validated_skill_workspace(
        state,
        input.scope,
        input.workspace_directory.as_deref(),
        input.workspace_id,
    )?;
    let source = state
        .skill_sources()?
        .browse(input.request)
        .map_err(|error| error.to_string())?;
    let skill = select_discovered_skill(&source, &input.skill_path)?;
    let context = skill_target_context(home, workspace_directory.as_deref())?;
    let plan = skill_installation::plan_install_for(&skill, input.agent, input.scope, &context)
        .map_err(|error| error.to_string())?;
    let plan_id = plan_identifier();
    state.store_pending_skill_plan(
        plan_id.clone(),
        PendingSkillPlan {
            plan: plan.clone(),
            skill: skill.clone(),
            context,
            workspace_id,
            created_at: SystemTime::now(),
        },
    )?;
    Ok(SkillInstallPlanPreview {
        plan_id,
        plan,
        source: skill.source,
        display_name: skill.display_name,
        description: skill.description,
    })
}

#[tauri::command]
fn apply_skill_install(
    state: tauri::State<'_, AppState>,
    plan_id: String,
) -> Result<skill_installation::ManagedInstallation, String> {
    apply_skill_install_for_state(&state, &plan_id).inspect_err(|_| {
        logging::command_failed(
            logging::Command::ApplySkillInstall,
            logging::FailureCode::Skills,
        );
    })
}

fn apply_skill_install_for_state(
    state: &AppState,
    plan_id: &str,
) -> Result<skill_installation::ManagedInstallation, String> {
    let pending = state.take_pending_skill_plan(plan_id)?;
    let result = skill_installation::apply_install_persisted_authorized(
        state.skill_sources()?,
        &pending.plan,
        &pending.skill,
        pending.workspace_id,
        &pending.context,
        state.skill_repository()?.as_ref(),
    );
    match result {
        Ok(result) => Ok(result),
        Err(error) => {
            // Keep a failed plan available for an explicit retry (for example,
            // after a transient SQLite lock), while the TTL still bounds memory.
            let _ = state.store_pending_skill_plan(plan_id.to_owned(), pending);
            Err(error.to_string())
        }
    }
}

#[tauri::command]
fn set_skill_enabled(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    target_directory: String,
    enabled: bool,
    workspace_directory: Option<String>,
) -> Result<skill_installation::ManagedInstallation, String> {
    let home = app.path().home_dir().map_err(|error| error.to_string())?;
    set_skill_enabled_for_state(
        home,
        &state,
        &target_directory,
        enabled,
        workspace_directory.as_deref(),
    )
    .inspect_err(|_| {
        logging::command_failed(
            logging::Command::SetSkillEnabled,
            logging::FailureCode::Skills,
        );
    })
}

fn set_skill_enabled_for_state(
    home: impl AsRef<Path>,
    state: &AppState,
    target_directory: &str,
    enabled: bool,
    workspace_directory: Option<&str>,
) -> Result<skill_installation::ManagedInstallation, String> {
    let context = lifecycle_target_context(
        state,
        home,
        Path::new(target_directory),
        workspace_directory,
    )?;
    skill_installation::set_enabled_persisted(
        target_directory,
        enabled,
        &context,
        state.skill_repository()?.as_ref(),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn uninstall_skill(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    target_directory: String,
    workspace_directory: Option<String>,
) -> Result<skill_installation::ManagedInstallation, String> {
    let home = app.path().home_dir().map_err(|error| error.to_string())?;
    uninstall_skill_for_state(
        home,
        &state,
        &target_directory,
        workspace_directory.as_deref(),
    )
    .inspect_err(|_| {
        logging::command_failed(
            logging::Command::UninstallSkill,
            logging::FailureCode::Skills,
        );
    })
}

fn uninstall_skill_for_state(
    home: impl AsRef<Path>,
    state: &AppState,
    target_directory: &str,
    workspace_directory: Option<&str>,
) -> Result<skill_installation::ManagedInstallation, String> {
    let context = lifecycle_target_context(
        state,
        home,
        Path::new(target_directory),
        workspace_directory,
    )?;
    skill_installation::remove_installation_persisted(
        target_directory,
        &context,
        state.skill_repository()?.as_ref(),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn collect_diagnostics(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    severity: Option<diagnostics::Severity>,
    agent: Option<Agent>,
    scope: Option<Scope>,
    resource_path: Option<String>,
) -> Result<Vec<diagnostics::UnifiedDiagnostic>, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    let collected = collect_all_diagnostics(&home_directory, &state)?;
    Ok(diagnostics::filter_diagnostics(
        &collected,
        &diagnostics::DiagnosticFilter {
            severity,
            agent,
            scope,
            resource_path: resource_path.map(PathBuf::from),
        },
    ))
}

fn collect_all_diagnostics(
    home_directory: &Path,
    state: &AppState,
) -> Result<Vec<diagnostics::UnifiedDiagnostic>, String> {
    let context = ScanContext::from_environment(home_directory);
    let documents = [
        ClaudeCodeAdapter.scan_global(&context),
        agents::standard::CodexAdapter.scan_global(&context),
        agents::standard::OpenCodeAdapter.scan_global(&context),
    ];
    let mut collected = documents
        .iter()
        .flat_map(diagnostics::from_config)
        .collect::<Vec<_>>();
    let inventory = skills::scan_installed_skills(home_directory, None::<&Path>);
    collected.extend(
        inventory
            .diagnostics
            .iter()
            .map(|item| diagnostics::from_skill(item, None, None)),
    );
    collected.extend(
        inventory
            .duplicate_names
            .iter()
            .map(|name| diagnostics::duplicate_skill(name)),
    );
    let failed_config_scans = documents
        .iter()
        .filter(|document| {
            document
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code != agents::DiagnosticCode::FileMissing)
        })
        .count();
    let failed_scans = failed_config_scans
        + inventory
            .diagnostics
            .iter()
            .filter(|item| item.severity == skills::DiagnosticSeverity::Error)
            .count();
    collected.push(diagnostics::scan_health(
        documents.len() + inventory.skills.len(),
        failed_scans,
    ));
    // V1 keeps the inventory derived from a fresh read; reporting the cache as
    // healthy makes that invariant explicit without exposing local paths.
    collected.push(diagnostics::cache_health(inventory.skills.len(), 0));
    let storage = state
        .storage_diagnostics
        .diagnostics()
        .map_err(|error| error.to_string())?;
    collected.push(diagnostics::storage_health(
        storage.schema_version,
        &storage.forbidden_schema_columns,
    ));
    Ok(collected)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticRecoveryRequest {
    diagnostic_code: String,
    resource_path: Option<String>,
    action: Option<diagnostics::RecoveryAction>,
    recovery_id: Option<String>,
    format: Option<ConfigFormat>,
    replacement: Option<String>,
    expected_checksum: Option<String>,
    #[serde(default)]
    previewed: bool,
    #[serde(default)]
    confirmed: bool,
}

fn find_recovery_diagnostic<'a>(
    diagnostics: &'a [diagnostics::UnifiedDiagnostic],
    request: &DiagnosticRecoveryRequest,
) -> Result<&'a diagnostics::UnifiedDiagnostic, String> {
    let requested_path = request.resource_path.as_ref().map(PathBuf::from);
    let mut matches = diagnostics.iter().filter(|diagnostic| {
        diagnostic.code == request.diagnostic_code
            && requested_path
                .as_ref()
                .is_none_or(|path| diagnostic.resource_path.as_ref() == Some(path))
    });
    let diagnostic = matches.next().ok_or_else(|| {
        "diagnostic is stale or no longer exists; rescan before recovery".to_owned()
    })?;
    if matches.next().is_some() && requested_path.is_none() {
        return Err("resource_path is required when a diagnostic code is ambiguous".into());
    }
    Ok(diagnostic)
}

fn recovery_request_action_matches(
    request: &DiagnosticRecoveryRequest,
    plan: &diagnostics::RecoveryPlan,
) -> Result<(), String> {
    if request
        .action
        .is_some_and(|requested| requested != plan.action)
    {
        return Err("recovery action does not match the current diagnostic".into());
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticRecoveryResult {
    recovery_id: String,
    action: diagnostics::RecoveryAction,
    outcome: diagnostics::RecoveryOutcome,
    resource_path: Option<PathBuf>,
    next_command: Option<String>,
    diagnostics: Vec<diagnostics::UnifiedDiagnostic>,
    diagnostics_refreshed: bool,
    config_write: Option<configuration::ConfigWriteResult>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticRecoveryPreview {
    recovery_id: String,
    plan: diagnostics::RecoveryPlan,
    summary: String,
    next_command: Option<String>,
    config_preview: Option<configuration::ConfigEditPreview>,
}

#[tauri::command]
fn preview_diagnostic_recovery(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request: DiagnosticRecoveryRequest,
) -> Result<DiagnosticRecoveryPreview, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    preview_diagnostic_recovery_for_state(&home_directory, &state, request).inspect_err(|_| {
        logging::command_failed(
            logging::Command::PreviewDiagnosticRecovery,
            logging::FailureCode::Diagnostics,
        );
    })
}

fn preview_diagnostic_recovery_for_state(
    home_directory: &Path,
    state: &AppState,
    request: DiagnosticRecoveryRequest,
) -> Result<DiagnosticRecoveryPreview, String> {
    let collected = collect_all_diagnostics(home_directory, state)?;
    let diagnostic = find_recovery_diagnostic(&collected, &request)?;
    let preview = {
        let mut registry = state
            .recovery_registry
            .lock()
            .map_err(|_| "diagnostic recovery registry is unavailable".to_owned())?;
        registry
            .preview(diagnostic)
            .ok_or_else(|| "this diagnostic has no automated recovery plan".to_owned())?
    };
    recovery_request_action_matches(&request, &preview.plan)?;

    // For configuration edits, create the same redacted diff used by the
    // dedicated editor. No bytes are written by this command.
    let config_preview = if preview.plan.action == diagnostics::RecoveryAction::EditConfig {
        let path = preview
            .plan
            .resource_path
            .as_ref()
            .ok_or_else(|| "configuration recovery requires a resource path".to_owned())?;
        let authorization = state.authorization(path)?;
        let format = request.format.unwrap_or(authorization.format);
        if format != authorization.format {
            return Err("configuration format does not match the discovered file".into());
        }
        let replacement = request
            .replacement
            .as_deref()
            .ok_or_else(|| "configuration recovery preview requires replacement".to_owned())?;
        Some(
            configuration::preview(path, format, replacement.as_bytes())
                .map_err(|error| error.to_string())?,
        )
    } else {
        None
    };
    if let Some(config_preview) = &config_preview {
        state
            .recovery_registry
            .lock()
            .map_err(|_| "diagnostic recovery registry is unavailable".to_owned())?
            .bind_content_checksum(&preview.recovery_id, config_preview.after_checksum.clone());
    }
    Ok(DiagnosticRecoveryPreview {
        recovery_id: preview.recovery_id,
        plan: preview.plan,
        summary: preview.summary,
        next_command: preview.next_command,
        config_preview,
    })
}

#[tauri::command]
fn execute_diagnostic_recovery(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request: DiagnosticRecoveryRequest,
) -> Result<DiagnosticRecoveryResult, String> {
    let home_directory = app.path().home_dir().map_err(|error| error.to_string())?;
    execute_diagnostic_recovery_for_state(&home_directory, &state, request).inspect_err(|_| {
        logging::command_failed(
            logging::Command::ExecuteDiagnosticRecovery,
            logging::FailureCode::Diagnostics,
        );
    })
}

fn execute_diagnostic_recovery_for_state(
    home_directory: &Path,
    state: &AppState,
    request: DiagnosticRecoveryRequest,
) -> Result<DiagnosticRecoveryResult, String> {
    let recovery_id = request
        .recovery_id
        .clone()
        .ok_or_else(|| "recovery_id from preview is required".to_owned())?;
    let plan = state
        .recovery_registry
        .lock()
        .map_err(|_| "diagnostic recovery registry is unavailable".to_owned())?
        .plan(&recovery_id)
        .ok_or_else(|| "recovery preview is missing or already consumed".to_owned())?;
    if plan.diagnostic_code != request.diagnostic_code {
        return Err("recovery preview does not match the requested diagnostic".into());
    }
    if plan.resource_path.as_ref() != request.resource_path.as_ref().map(PathBuf::from).as_ref() {
        return Err("recovery preview does not match the requested resource".into());
    }
    recovery_request_action_matches(&request, &plan)?;
    diagnostics::authorize_recovery(
        &plan,
        diagnostics::RecoveryApproval {
            previewed: request.previewed,
            confirmed: request.confirmed,
        },
    )
    .map_err(|error| error.to_string())?;

    // Keep the approved content outside the lock, then consume the ticket
    // immediately before the first side effect.
    let approved_content_checksum = state
        .recovery_registry
        .lock()
        .map_err(|_| "diagnostic recovery registry is unavailable".to_owned())?
        .content_checksum(&recovery_id);

    let (outcome, config_write) = match plan.action {
        diagnostics::RecoveryAction::RescanResource
        | diagnostics::RecoveryAction::ReloadResource
        | diagnostics::RecoveryAction::RefreshSkillSource => {
            consume_recovery_ticket(state, &recovery_id)?;
            (diagnostics::RecoveryOutcome::Refreshed, None)
        }
        diagnostics::RecoveryAction::EditConfig => {
            consume_recovery_ticket(state, &recovery_id)?;
            let path = plan
                .resource_path
                .as_ref()
                .ok_or_else(|| "configuration recovery requires a resource path".to_owned())?;
            let authorization = state.authorization(path)?;
            let format = request.format.unwrap_or(authorization.format);
            if format != authorization.format {
                return Err("configuration format does not match the discovered file".into());
            }
            let expected_checksum = request.expected_checksum.as_deref().ok_or_else(|| {
                "expected_checksum is required for configuration recovery".to_owned()
            })?;
            let approved_content_checksum = approved_content_checksum.ok_or_else(|| {
                "configuration recovery preview did not include approved content".to_owned()
            })?;
            let replacement = request
                .replacement
                .as_deref()
                .ok_or_else(|| "replacement is required for configuration recovery".to_owned())?;
            let preview = configuration::preview(path, format, replacement.as_bytes())
                .map_err(|error| error.to_string())?;
            if preview.before.checksum != expected_checksum {
                return Err(
                    "configuration changed after preview; reload before executing recovery".into(),
                );
            }
            if preview.after_checksum != approved_content_checksum {
                return Err("replacement does not match the approved recovery preview".into());
            }
            let result = write_config_for_state(
                state,
                path.to_string_lossy().as_ref(),
                format,
                expected_checksum,
                replacement,
            )?;
            (diagnostics::RecoveryOutcome::Applied, Some(result))
        }
        diagnostics::RecoveryAction::CreateConfig
        | diagnostics::RecoveryAction::RestoreBackup
        | diagnostics::RecoveryAction::ResolveDuplicateSkill => {
            return Err("this recovery requires its dedicated review or restore command".into())
        }
        diagnostics::RecoveryAction::ReviewVersionCompatibility
        | diagnostics::RecoveryAction::ReviewPermissions
        | diagnostics::RecoveryAction::RepairStorage => {
            return Err("this recovery requires its dedicated review or restore command".into())
        }
    };
    let refreshed = collect_all_diagnostics(home_directory, state);
    if refreshed.is_err() && config_write.is_none() {
        return Err("recovery scan could not refresh diagnostics".into());
    }
    let diagnostics_refreshed = refreshed.is_ok();
    let diagnostics = refreshed.unwrap_or_default();
    Ok(DiagnosticRecoveryResult {
        recovery_id,
        action: plan.action,
        outcome,
        resource_path: plan.resource_path,
        next_command: None,
        diagnostics,
        diagnostics_refreshed,
        config_write,
    })
}

fn consume_recovery_ticket(state: &AppState, recovery_id: &str) -> Result<(), String> {
    let consumed = state
        .recovery_registry
        .lock()
        .map_err(|_| "diagnostic recovery registry is unavailable".to_owned())?
        .complete(recovery_id);
    if consumed {
        Ok(())
    } else {
        Err("recovery preview is missing or already consumed".into())
    }
}

#[tauri::command]
fn preview_config_edit(
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
fn read_config_source(state: tauri::State<'_, AppState>, path: String) -> Result<String, String> {
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
fn write_config(
    state: tauri::State<'_, AppState>,
    path: String,
    format: ConfigFormat,
    expected_checksum: String,
    replacement: String,
) -> Result<configuration::ConfigWriteResult, String> {
    write_config_for_state(&state, &path, format, &expected_checksum, &replacement)
}

fn write_config_for_state(
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
fn rollback_config(
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

fn record_config_change(
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

fn record_config_change_or_restore(
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
fn list_config_history(
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
fn get_config_history_entry(
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

fn authorized_history_entry(
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
fn preview_config_restore(
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
fn restore_config_history(
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(logging::plugin())
        .setup(|app| {
            let data_directory = app.path().app_data_dir().map_err(|error| {
                std::io::Error::other(format!("could not resolve app data directory: {error}"))
            })?;
            let database_path = data_directory.join("agent-hub.sqlite3");
            let database = persistence::Database::open(&database_path).map_err(|error| {
                logging::command_failed(
                    logging::Command::DatabaseOpen,
                    logging::FailureCode::Persistence,
                );
                std::io::Error::other(error.to_string())
            })?;
            logging::database_opened();
            logging::app_started(env!("CARGO_PKG_VERSION"));
            let database = Arc::new(database);
            let workspace_repository: Arc<dyn WorkspaceRepository> = database.clone();
            let config_metadata_repository: Arc<dyn ConfigMetadataRepository> = database.clone();
            let skill_repository: Arc<dyn SkillRepository> = database.clone();
            let storage_repository: Arc<dyn StorageDiagnosticsRepository> = database;
            let mut state = AppState::new(
                workspace_repository,
                config_metadata_repository,
                storage_repository,
                data_directory.join("backups"),
            );
            state.configure_skill_services(
                skill_repository,
                Arc::new(skills::SkillSourceManager::new(
                    data_directory.join("skill-sources"),
                )),
            );
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            storage_diagnostics,
            scan_claude_global,
            scan_codex_global,
            scan_opencode_global,
            scan_skills,
            browse_skill_source,
            plan_skill_install,
            apply_skill_install,
            set_skill_enabled,
            uninstall_skill,
            collect_diagnostics,
            preview_diagnostic_recovery,
            execute_diagnostic_recovery,
            list_workspaces,
            add_workspace,
            remove_workspace,
            scan_workspace,
            read_config_source,
            preview_config_edit,
            write_config,
            rollback_config,
            list_config_history,
            get_config_history_entry,
            preview_config_restore,
            restore_config_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgentHub");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_state(root: &Path) -> AppState {
        let database = Arc::new(
            persistence::Database::open(root.join("state/agent-hub.sqlite3")).expect("database"),
        );
        let workspace_repository: Arc<dyn WorkspaceRepository> = database.clone();
        let config_repository: Arc<dyn ConfigMetadataRepository> = database.clone();
        let storage_repository: Arc<dyn StorageDiagnosticsRepository> = database.clone();
        let mut state = AppState::new(
            workspace_repository,
            config_repository,
            storage_repository,
            root.join("backups"),
        );
        state.configure_skill_services(
            database,
            Arc::new(skills::SkillSourceManager::new(root.join("skill-sources"))),
        );
        state
    }

    #[test]
    fn exposes_application_metadata() {
        assert_eq!(
            app_info(),
            AppInfo {
                name: "AgentHub",
                version: env!("CARGO_PKG_VERSION"),
            }
        );
    }

    #[test]
    fn workspace_input_is_canonical_and_instruction_scan_is_read_only() {
        let root = tempfile::tempdir().expect("workspace");
        std::fs::write(root.path().join("AGENTS.md"), "# Rules").expect("instruction");
        std::fs::create_dir(root.path().join("nested")).expect("nested directory");
        std::fs::write(root.path().join("nested/CLAUDE.local.md"), "# Local")
            .expect("nested instruction");
        let input = workspace_input(&root.path().to_string_lossy()).expect("workspace input");
        assert_eq!(
            input.canonical_path.as_deref(),
            Some(
                root.path()
                    .canonicalize()
                    .expect("canonical")
                    .to_string_lossy()
                    .as_ref()
            )
        );
        let instructions = discover_instruction_files(root.path());
        assert_eq!(instructions.len(), 2);
        assert!(root.path().join("AGENTS.md").is_file());
    }

    #[cfg(unix)]
    #[test]
    fn workspace_input_rejects_symbolic_links() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().expect("workspace");
        let link = root.path().with_extension("link");
        symlink(root.path(), &link).expect("symlink");
        assert!(workspace_input(&link.to_string_lossy()).is_err());
        std::fs::remove_file(link).expect("remove link");
    }

    #[test]
    fn instruction_scan_skips_generated_directories_and_stops_at_budget() {
        let root = tempfile::tempdir().expect("workspace");
        for ignored in [".git", "node_modules", "target", "dist"] {
            let directory = root.path().join(ignored);
            std::fs::create_dir_all(&directory).expect("ignored directory");
            std::fs::write(directory.join("AGENTS.md"), "must not be scanned")
                .expect("ignored instruction");
        }
        std::fs::create_dir(root.path().join("src")).expect("source directory");
        std::fs::write(root.path().join("src/AGENTS.md"), "valid").expect("instruction");
        assert_eq!(discover_instruction_files(root.path()).len(), 1);

        let limited = discover_instruction_files_with_limits(root.path(), 16, 2, 500);
        assert!(limited.len() <= 2);
        let capped = discover_instruction_files_with_limits(root.path(), 16, 20_000, 0);
        assert!(capped.is_empty());
    }

    #[test]
    fn diagnostic_recovery_commands_enforce_preview_confirmation_and_one_time_use() {
        let root = tempfile::tempdir().expect("home");
        let codex_directory = root.path().join(".codex");
        std::fs::create_dir(&codex_directory).expect("Codex directory");
        let path = codex_directory.join("config.toml");
        std::fs::write(&path, "model = [\n").expect("invalid config");
        let state = test_state(root.path());
        let document = agents::standard::CodexAdapter.scan_global(&ScanContext::new(root.path()));
        register_global_config(&state, &document).expect("configuration registered");
        let replacement = "model = \"gpt-5\"\n";

        let preview = preview_diagnostic_recovery_for_state(
            root.path(),
            &state,
            DiagnosticRecoveryRequest {
                diagnostic_code: "config:toml-syntax".into(),
                resource_path: Some(path.to_string_lossy().into_owned()),
                action: Some(diagnostics::RecoveryAction::EditConfig),
                recovery_id: None,
                format: Some(ConfigFormat::Toml),
                replacement: Some(replacement.into()),
                expected_checksum: None,
                previewed: false,
                confirmed: false,
            },
        )
        .expect("recovery preview");
        let config_preview = preview
            .config_preview
            .as_ref()
            .expect("redacted config diff is returned");
        assert!(config_preview.changed);
        assert!(!config_preview.diff.is_empty());

        let execute_request = |previewed, confirmed| DiagnosticRecoveryRequest {
            diagnostic_code: "config:toml-syntax".into(),
            resource_path: Some(path.to_string_lossy().into_owned()),
            action: Some(diagnostics::RecoveryAction::EditConfig),
            recovery_id: Some(preview.recovery_id.clone()),
            format: Some(ConfigFormat::Toml),
            replacement: Some(replacement.into()),
            expected_checksum: Some(config_preview.before.checksum.clone()),
            previewed,
            confirmed,
        };
        assert!(execute_diagnostic_recovery_for_state(
            root.path(),
            &state,
            execute_request(false, false)
        )
        .unwrap_err()
        .contains("previewed"));
        assert!(execute_diagnostic_recovery_for_state(
            root.path(),
            &state,
            execute_request(true, false)
        )
        .unwrap_err()
        .contains("confirmation"));

        let mut changed_after_preview = execute_request(true, true);
        changed_after_preview.replacement = Some("model = \"different\"\n".into());
        assert!(
            execute_diagnostic_recovery_for_state(root.path(), &state, changed_after_preview)
                .unwrap_err()
                .contains("approved recovery preview")
        );
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "model = [\n");

        let retry_preview = preview_diagnostic_recovery_for_state(
            root.path(),
            &state,
            DiagnosticRecoveryRequest {
                diagnostic_code: "config:toml-syntax".into(),
                resource_path: Some(path.to_string_lossy().into_owned()),
                action: Some(diagnostics::RecoveryAction::EditConfig),
                recovery_id: None,
                format: Some(ConfigFormat::Toml),
                replacement: Some(replacement.into()),
                expected_checksum: None,
                previewed: false,
                confirmed: false,
            },
        )
        .expect("recovery can be previewed again after a rejected attempt");
        let retry_checksum = retry_preview
            .config_preview
            .as_ref()
            .unwrap()
            .before
            .checksum
            .clone();
        let result = execute_diagnostic_recovery_for_state(
            root.path(),
            &state,
            DiagnosticRecoveryRequest {
                diagnostic_code: "config:toml-syntax".into(),
                resource_path: Some(path.to_string_lossy().into_owned()),
                action: Some(diagnostics::RecoveryAction::EditConfig),
                recovery_id: Some(retry_preview.recovery_id.clone()),
                format: Some(ConfigFormat::Toml),
                replacement: Some(replacement.into()),
                expected_checksum: Some(retry_checksum.clone()),
                previewed: true,
                confirmed: true,
            },
        )
        .expect("confirmed recovery executes");
        assert_eq!(result.outcome, diagnostics::RecoveryOutcome::Applied);
        assert!(result.diagnostics_refreshed);
        assert!(result.config_write.is_some());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), replacement);
        assert!(execute_diagnostic_recovery_for_state(
            root.path(),
            &state,
            DiagnosticRecoveryRequest {
                diagnostic_code: "config:toml-syntax".into(),
                resource_path: Some(path.to_string_lossy().into_owned()),
                action: Some(diagnostics::RecoveryAction::EditConfig),
                recovery_id: Some(retry_preview.recovery_id),
                format: Some(ConfigFormat::Toml),
                replacement: Some(replacement.into()),
                expected_checksum: Some(retry_checksum),
                previewed: true,
                confirmed: true,
            }
        )
        .unwrap_err()
        .contains("already consumed"));
    }

    #[test]
    fn safe_recovery_rescans_without_confirmation_and_manual_recovery_is_rejected() {
        let root = tempfile::tempdir().expect("home");
        let opencode_directory = root.path().join(".config/opencode");
        std::fs::create_dir_all(&opencode_directory).expect("OpenCode directory");
        let path = opencode_directory.join("opencode.json");
        std::fs::write(&path, r#"{"$schema":7}"#).expect("schema mismatch config");
        let state = test_state(root.path());

        let safe_preview = preview_diagnostic_recovery_for_state(
            root.path(),
            &state,
            DiagnosticRecoveryRequest {
                diagnostic_code: "scan:partial".into(),
                resource_path: None,
                action: Some(diagnostics::RecoveryAction::RescanResource),
                recovery_id: None,
                format: None,
                replacement: None,
                expected_checksum: None,
                previewed: false,
                confirmed: false,
            },
        )
        .expect("safe scan preview");
        let safe_result = execute_diagnostic_recovery_for_state(
            root.path(),
            &state,
            DiagnosticRecoveryRequest {
                diagnostic_code: "scan:partial".into(),
                resource_path: None,
                action: Some(diagnostics::RecoveryAction::RescanResource),
                recovery_id: Some(safe_preview.recovery_id),
                format: None,
                replacement: None,
                expected_checksum: None,
                previewed: false,
                confirmed: false,
            },
        )
        .expect("safe rescan executes without confirmation");
        assert_eq!(safe_result.outcome, diagnostics::RecoveryOutcome::Refreshed);
        assert!(safe_result.diagnostics_refreshed);

        let manual_preview = preview_diagnostic_recovery_for_state(
            root.path(),
            &state,
            DiagnosticRecoveryRequest {
                diagnostic_code: "config:schema-mismatch".into(),
                resource_path: Some(path.to_string_lossy().into_owned()),
                action: Some(diagnostics::RecoveryAction::ReviewVersionCompatibility),
                recovery_id: None,
                format: None,
                replacement: None,
                expected_checksum: None,
                previewed: false,
                confirmed: false,
            },
        )
        .expect("manual recovery is explainable");
        let error = execute_diagnostic_recovery_for_state(
            root.path(),
            &state,
            DiagnosticRecoveryRequest {
                diagnostic_code: "config:schema-mismatch".into(),
                resource_path: Some(path.to_string_lossy().into_owned()),
                action: Some(diagnostics::RecoveryAction::ReviewVersionCompatibility),
                recovery_id: Some(manual_preview.recovery_id),
                format: None,
                replacement: None,
                expected_checksum: None,
                previewed: true,
                confirmed: true,
            },
        )
        .expect_err("manual recovery never auto-executes");
        assert!(error.contains("manually"));
    }

    #[test]
    fn removing_a_workspace_only_revokes_authorization_and_keeps_files() {
        let root = tempfile::tempdir().expect("workspace");
        let codex_directory = root.path().join(".codex");
        std::fs::create_dir(&codex_directory).expect("Codex directory");
        let config_path = codex_directory.join("config.toml");
        std::fs::write(&config_path, "model = \"gpt-5\"\n").expect("config");
        let workspace = workspace_input(&root.path().to_string_lossy()).expect("workspace input");
        let database = Arc::new(
            persistence::Database::open(root.path().join("state/agent-hub.sqlite3"))
                .expect("database"),
        );
        let document = agents::standard::CodexAdapter.scan_workspace(root.path());
        let workspace_id = database
            .replace_workspace_scan(&workspace, &[config_index(&document)])
            .expect("scan is indexed");
        let config_id = database.config_indexes(workspace_id).expect("index loads")[0].id;
        let workspace_repository: Arc<dyn WorkspaceRepository> = database.clone();
        let config_repository: Arc<dyn ConfigMetadataRepository> = database.clone();
        let storage_repository: Arc<dyn StorageDiagnosticsRepository> = database;
        let state = AppState::new(
            workspace_repository,
            config_repository,
            storage_repository,
            root.path().join("backups"),
        );
        state.authorize(&document, config_id).expect("authorized");

        assert!(remove_workspace_record(&state, workspace_id).expect("remove record"));

        assert!(root.path().is_dir());
        assert_eq!(
            std::fs::read_to_string(&config_path).expect("config remains"),
            "model = \"gpt-5\"\n"
        );
        assert!(state.authorization(&config_path).is_err());
    }

    #[test]
    fn history_persistence_failure_compensates_the_file_write() {
        let root = tempfile::tempdir().expect("workspace");
        let codex_directory = root.path().join(".codex");
        std::fs::create_dir(&codex_directory).expect("Codex directory");
        let config_path = codex_directory.join("config.toml");
        std::fs::write(&config_path, "model = \"before\"\n").expect("config");
        let workspace = workspace_input(&root.path().to_string_lossy()).expect("workspace input");
        let database = Arc::new(
            persistence::Database::open(root.path().join("state/agent-hub.sqlite3"))
                .expect("database"),
        );
        let document = agents::standard::CodexAdapter.scan_workspace(root.path());
        let workspace_id = database
            .replace_workspace_scan(&workspace, &[config_index(&document)])
            .expect("scan is indexed");
        let config_id = database.config_indexes(workspace_id).expect("index loads")[0].id;
        let workspace_repository: Arc<dyn WorkspaceRepository> = database.clone();
        let config_repository: Arc<dyn ConfigMetadataRepository> = database.clone();
        let storage_repository: Arc<dyn StorageDiagnosticsRepository> = database.clone();
        let backup_root = root.path().join("backups").join(config_id.to_string());
        let state = AppState::new(
            workspace_repository,
            config_repository,
            storage_repository,
            root.path().join("backups"),
        );
        // Simulate a database record disappearing between authorization and history persistence.
        database
            .remove_workspace(workspace_id)
            .expect("remove index directly");
        let result = configuration::write_atomically(
            &config_path,
            ConfigFormat::Toml,
            document.checksum.as_deref().expect("checksum"),
            b"model = \"after\"\n",
            &backup_root,
        )
        .expect("filesystem phase");

        let error = record_config_change_or_restore(
            &state,
            config_id,
            "edit",
            &result,
            &config_path,
            ConfigFormat::Toml,
            &backup_root,
        )
        .expect_err("missing index prevents history persistence");

        assert!(error.contains("configuration was restored"));
        assert_eq!(
            std::fs::read_to_string(&config_path).expect("restored config"),
            "model = \"before\"\n"
        );
    }

    #[test]
    fn skill_command_contract_rejects_path_escape_and_selects_relative_skill() {
        use crate::skills::SkillSourceAdapter;
        let root = tempfile::tempdir().expect("source");
        let directory = root.path().join("review");
        std::fs::create_dir_all(&directory).expect("Skill directory");
        std::fs::write(
            directory.join("SKILL.md"),
            "---\nname: review\ndescription: Review changes\n---\n",
        )
        .expect("entrypoint");
        let source = skills::SourceMetadata {
            kind: skills::SourceKind::Local,
            locator: root.path().to_string_lossy().into_owned(),
            manifest_path: None,
            requested_ref: None,
            resolved_commit: None,
        };
        let skill = skills::LocalSourceAdapter::new(root.path())
            .scan()
            .expect("source scans")
            .skills
            .into_iter()
            .next()
            .expect("Skill discovered");
        let browse = skills::SourceBrowseResult {
            source,
            skills: vec![skill],
            catalog_entries: Vec::new(),
            diagnostics: Vec::new(),
        };
        assert!(select_discovered_skill(&browse, "../review").is_err());
        assert_eq!(
            select_discovered_skill(&browse, "review")
                .expect("Skill selected")
                .name
                .as_deref(),
            Some("review")
        );
    }

    #[test]
    fn skill_workspace_command_contract_requires_registered_workspace() {
        let root = tempfile::tempdir().expect("workspace");
        let database = Arc::new(
            persistence::Database::open(root.path().join("state.sqlite3")).expect("database"),
        );
        let workspace_repository: Arc<dyn WorkspaceRepository> = database.clone();
        let config_repository: Arc<dyn ConfigMetadataRepository> = database.clone();
        let storage_repository: Arc<dyn StorageDiagnosticsRepository> = database;
        let state = AppState::new(
            workspace_repository,
            config_repository,
            storage_repository,
            root.path().join("backups"),
        );
        assert!(validated_skill_workspace(
            &state,
            Scope::Global,
            Some(root.path().to_string_lossy().as_ref()),
            None,
        )
        .is_err());
        assert!(validated_skill_workspace(
            &state,
            Scope::Workspace,
            Some(root.path().to_string_lossy().as_ref()),
            None,
        )
        .is_err());
    }

    #[test]
    fn skill_workspace_install_requires_and_uses_registered_workspace() {
        let root = tempfile::tempdir().expect("home");
        let workspace = root.path().join("workspace");
        let source = root.path().join("source/review");
        std::fs::create_dir_all(&workspace).expect("workspace directory");
        std::fs::create_dir_all(&source).expect("source directory");
        std::fs::write(
            source.join("SKILL.md"),
            "---\nname: review\ndescription: Review changes\n---\n# Review\n",
        )
        .expect("skill entrypoint");
        let state = test_state(root.path());
        let workspace_input = workspace_input(&workspace.to_string_lossy()).expect("workspace");
        let workspace_id = state
            .workspaces
            .add_workspace(&workspace_input)
            .expect("workspace registration");
        let preview = create_skill_install_plan_for_state(
            root.path(),
            &state,
            SkillInstallRequest {
                request: skills::SourceRequest::LocalDirectory {
                    path: root.path().join("source"),
                },
                skill_path: "review".into(),
                agent: Agent::OpenCode,
                scope: Scope::Workspace,
                workspace_directory: Some(workspace.to_string_lossy().into_owned()),
                workspace_id: Some(workspace_id),
            },
        )
        .expect("workspace installation plan");
        assert_eq!(
            preview.plan.target_directory,
            workspace
                .canonicalize()
                .expect("canonical workspace")
                .join(".opencode/skills/review")
        );
        let installed = apply_skill_install_for_state(&state, &preview.plan_id)
            .expect("workspace installation");
        assert_eq!(installed.scope, Scope::Workspace);
        assert!(installed.target_directory.join("SKILL.md").is_file());
    }

    #[test]
    fn pending_skill_plan_store_expires_and_bounds_unconfirmed_plans() {
        let root = tempfile::tempdir().expect("home");
        let source = root.path().join("source/review");
        std::fs::create_dir_all(&source).expect("source directory");
        std::fs::write(
            source.join("SKILL.md"),
            "---\nname: review\ndescription: Review changes\n---\n# Review\n",
        )
        .expect("skill entrypoint");
        let state = test_state(root.path());
        let preview = create_skill_install_plan_for_state(
            root.path(),
            &state,
            SkillInstallRequest {
                request: skills::SourceRequest::LocalDirectory {
                    path: root.path().join("source"),
                },
                skill_path: "review".into(),
                agent: Agent::Codex,
                scope: Scope::Global,
                workspace_directory: None,
                workspace_id: None,
            },
        )
        .expect("installation plan");
        let pending = state
            .pending_skill_plans
            .lock()
            .expect("pending plan store")
            .get(&preview.plan_id)
            .cloned()
            .expect("pending plan");
        for index in 0..=MAX_PENDING_SKILL_PLANS {
            let mut candidate = pending.clone();
            candidate.created_at = SystemTime::now() + Duration::from_secs(index as u64);
            state
                .store_pending_skill_plan(format!("capacity-{index}"), candidate)
                .expect("plan stored");
        }
        assert_eq!(
            state
                .pending_skill_plans
                .lock()
                .expect("pending plan store")
                .len(),
            MAX_PENDING_SKILL_PLANS
        );
        assert!(state.take_pending_skill_plan("capacity-0").is_err());

        let mut expired = pending;
        expired.created_at = SystemTime::now()
            .checked_sub(PENDING_SKILL_PLAN_TTL + Duration::from_secs(1))
            .expect("past timestamp");
        state
            .store_pending_skill_plan("expired".into(), expired)
            .expect("expired plan inserted");
        assert!(state.take_pending_skill_plan("expired").is_err());
    }

    #[test]
    fn skill_command_contract_completes_global_install_lifecycle_and_persists_state() {
        let root = tempfile::tempdir().expect("home");
        let source = root.path().join("source/review");
        std::fs::create_dir_all(&source).expect("source directory");
        std::fs::write(
            source.join("SKILL.md"),
            "---\nname: review\ndescription: Review changes\n---\n# Review\n",
        )
        .expect("skill entrypoint");
        let state = test_state(root.path());
        let preview = create_skill_install_plan_for_state(
            root.path(),
            &state,
            SkillInstallRequest {
                request: skills::SourceRequest::LocalDirectory {
                    path: root.path().join("source"),
                },
                skill_path: "review".into(),
                agent: Agent::ClaudeCode,
                scope: Scope::Global,
                workspace_directory: None,
                workspace_id: None,
            },
        )
        .expect("installation plan");
        let target = preview.plan.target_directory.clone();
        let installed =
            apply_skill_install_for_state(&state, &preview.plan_id).expect("installation applies");
        assert_eq!(installed.target_directory, target);
        assert!(target.join("SKILL.md").is_file());

        let persisted = rusqlite::Connection::open(root.path().join("state/agent-hub.sqlite3"))
            .expect("database opens");
        assert_eq!(
            persisted
                .query_row("SELECT COUNT(*) FROM skill_installations", [], |row| row
                    .get::<_, i64>(0))
                .expect("installation persisted"),
            1
        );
        assert!(apply_skill_install_for_state(&state, &preview.plan_id).is_err());

        let disabled = set_skill_enabled_for_state(
            root.path(),
            &state,
            &target.to_string_lossy(),
            false,
            None,
        )
        .expect("disable installation");
        assert!(!disabled.enabled);
        assert!(target.join("SKILL.md.agent-hub-disabled").is_file());
        let enabled =
            set_skill_enabled_for_state(root.path(), &state, &target.to_string_lossy(), true, None)
                .expect("enable installation");
        assert!(enabled.enabled);
        assert!(target.join("SKILL.md").is_file());

        uninstall_skill_for_state(root.path(), &state, &target.to_string_lossy(), None)
            .expect("uninstall installation");
        assert!(!target.exists());
        assert_eq!(
            persisted
                .query_row("SELECT COUNT(*) FROM skill_installations", [], |row| row
                    .get::<_, i64>(0))
                .expect("installation removed"),
            0
        );
    }

    #[test]
    fn skill_apply_rejects_source_changes_after_preview() {
        let root = tempfile::tempdir().expect("home");
        let source = root.path().join("source/review");
        std::fs::create_dir_all(&source).expect("source directory");
        let entrypoint = source.join("SKILL.md");
        std::fs::write(
            &entrypoint,
            "---\nname: review\ndescription: Review changes\n---\n# Review\n",
        )
        .expect("skill entrypoint");
        let state = test_state(root.path());
        let preview = create_skill_install_plan_for_state(
            root.path(),
            &state,
            SkillInstallRequest {
                request: skills::SourceRequest::LocalDirectory {
                    path: root.path().join("source"),
                },
                skill_path: "review".into(),
                agent: Agent::Codex,
                scope: Scope::Global,
                workspace_directory: None,
                workspace_id: None,
            },
        )
        .expect("installation plan");
        std::fs::write(
            &entrypoint,
            "---\nname: review\ndescription: Review changes\n---\n# Changed\n",
        )
        .expect("source mutation");
        let error = apply_skill_install_for_state(&state, &preview.plan_id)
            .expect_err("changed source is rejected");
        assert!(error.contains("changed"));
        assert!(!preview.plan.target_directory.exists());
    }
}
