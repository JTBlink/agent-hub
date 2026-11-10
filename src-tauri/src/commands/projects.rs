use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Instant;
use walkdir::WalkDir;

use serde::Serialize;
use tauri::State;

use crate::core::skill_store::{ProjectRecord, SkillRecord, SkillStore};
use crate::core::timing::should_log_first_or_slow;
use crate::core::{error::AppError, installer, project_scanner, sync_engine, tool_adapters};

#[derive(Serialize, Default)]
pub struct SyncHealthDto {
    pub in_sync: usize,
    pub project_newer: usize,
    pub center_newer: usize,
    pub diverged: usize,
    pub project_only: usize,
}

#[derive(Serialize)]
pub struct ProjectDto {
    pub id: String,
    pub name: String,
    pub path: String,
    pub workspace_type: String,
    pub linked_agent_name: Option<String>,
    pub supports_skill_toggle: bool,
    pub sort_order: i32,
    pub skill_count: usize,
    pub sync_health: SyncHealthDto,
    pub created_at: i64,
    pub updated_at: i64,
    pub visited_at: Option<i64>,
}

#[derive(Serialize)]
pub struct ProjectSkillDocumentDto {
    pub skill_name: String,
    pub filename: String,
    pub content: String,
}

#[derive(Serialize)]
pub struct ProjectSkillFileDto {
    pub filename: String,
    pub content: String,
}

#[derive(Serialize, Clone)]
pub struct ProjectAgentTargetDto {
    pub key: String,
    pub display_name: String,
    pub enabled: bool,
    pub installed: bool,
    pub is_custom: bool,
}

pub(super) fn agent_skill_configs(store: &SkillStore) -> Vec<project_scanner::AgentSkillConfig> {
    let mut grouped: Vec<(String, Vec<(String, String)>)> = Vec::new();
    for adapter in tool_adapters::all_tool_adapters(store) {
        let project_dir = adapter.project_relative_skills_dir().to_string();
        if project_dir.is_empty() {
            continue;
        }
        if let Some((_, agents)) = grouped.iter_mut().find(|(dir, _)| *dir == project_dir) {
            agents.push((adapter.key, adapter.display_name));
        } else {
            grouped.push((project_dir, vec![(adapter.key, adapter.display_name)]));
        }
    }

    grouped
        .into_iter()
        .filter_map(|(relative_skills_dir, agents)| {
            let (key, first_display_name) = agents.first()?.clone();
            let display_name = if agents.len() == 1 {
                first_display_name
            } else {
                agents
                    .into_iter()
                    .map(|(_, display_name)| display_name)
                    .collect::<Vec<_>>()
                    .join(" / ")
            };
            Some(project_scanner::AgentSkillConfig {
                key,
                display_name,
                relative_skills_dir,
            })
        })
        .collect()
}

fn linked_workspace_agent_key(rec: &ProjectRecord) -> String {
    rec.linked_agent_key
        .clone()
        .unwrap_or_else(|| slugify_skill_dir_name(&rec.name))
}

fn linked_workspace_agent_name(rec: &ProjectRecord) -> String {
    rec.linked_agent_name
        .clone()
        .unwrap_or_else(|| rec.name.clone())
}

pub(super) fn read_workspace_skills(
    rec: &ProjectRecord,
    configs: &[project_scanner::AgentSkillConfig],
) -> Vec<project_scanner::ProjectSkillInfo> {
    if rec.workspace_type == "linked" {
        return project_scanner::read_linked_workspace_skills(
            Path::new(&rec.path),
            rec.disabled_path.as_deref().map(Path::new),
            &linked_workspace_agent_key(rec),
            &linked_workspace_agent_name(rec),
            true,
        );
    }
    project_scanner::read_project_skills(Path::new(&rec.path), configs)
}

/// Resolve the enabled and disabled skills root directories for a given agent in a workspace.
pub(super) fn resolve_agent_skills_roots(
    store: &SkillStore,
    rec: &ProjectRecord,
    agent: &str,
) -> Option<(PathBuf, Option<PathBuf>)> {
    if rec.workspace_type == "linked" {
        if linked_workspace_agent_key(rec) != agent {
            return None;
        }
        return Some((
            PathBuf::from(&rec.path),
            rec.disabled_path.as_ref().map(PathBuf::from),
        ));
    }

    let adapter = tool_adapters::all_tool_adapters(store)
        .into_iter()
        .find(|adapter| adapter.key == agent)?;
    let project_dir = adapter.project_relative_skills_dir();
    let skills_root = Path::new(&rec.path).join(project_dir);
    let disabled_root = Path::new(&rec.path).join(format!("{}-disabled", project_dir));
    Some((skills_root, Some(disabled_root)))
}

fn project_agent_targets_for_record(
    store: &SkillStore,
    rec: &ProjectRecord,
) -> Vec<ProjectAgentTargetDto> {
    if rec.workspace_type == "linked" {
        return vec![ProjectAgentTargetDto {
            key: linked_workspace_agent_key(rec),
            display_name: linked_workspace_agent_name(rec),
            enabled: true,
            installed: true,
            is_custom: false,
        }];
    }

    agent_skill_configs(store)
        .into_iter()
        .map(|config| {
            let adapter = tool_adapters::find_adapter_with_store(store, &config.key);
            ProjectAgentTargetDto {
                // Project targets describe team support, independent of personal preferences.
                enabled: true,
                installed: adapter.as_ref().map(|a| a.is_installed()).unwrap_or(false),
                is_custom: adapter.as_ref().map(|a| a.is_custom).unwrap_or(false),
                key: config.key,
                display_name: config.display_name,
            }
        })
        .collect()
}

/// Convert a project record into its DTO, folding the copies of one logical
/// skill across agents together by relative path.
fn project_to_dto(
    rec: &ProjectRecord,
    all_managed: &[SkillRecord],
    configs: &[project_scanner::AgentSkillConfig],
) -> ProjectDto {
    let skills = read_workspace_skills(rec, configs);
    let mut grouped_statuses: HashMap<String, String> = HashMap::new();

    for skill in &skills {
        let matched = find_best_center_match(skill, all_managed);
        let status = classify_sync_status(skill, matched);
        let key = skill.relative_path.to_lowercase();
        let existing = grouped_statuses
            .entry(key)
            .or_insert_with(|| status.clone());
        if sync_status_priority(&status) > sync_status_priority(existing) {
            *existing = status;
        }
    }

    let skill_count = grouped_statuses.len();
    let mut health = SyncHealthDto::default();
    for status in grouped_statuses.values() {
        match status.as_str() {
            "in_sync" => health.in_sync += 1,
            "project_newer" => health.project_newer += 1,
            "center_newer" => health.center_newer += 1,
            "diverged" => health.diverged += 1,
            _ => health.project_only += 1,
        }
    }

    ProjectDto {
        skill_count,
        sync_health: health,
        ..project_metadata(rec)
    }
}

pub(crate) fn project_metadata(rec: &ProjectRecord) -> ProjectDto {
    ProjectDto {
        id: rec.id.clone(),
        name: rec.name.clone(),
        path: rec.path.clone(),
        workspace_type: rec.workspace_type.clone(),
        linked_agent_name: rec.linked_agent_name.clone(),
        supports_skill_toggle: rec.workspace_type != "linked" || rec.disabled_path.is_some(),
        sort_order: rec.sort_order,
        skill_count: 0,
        sync_health: SyncHealthDto::default(),
        created_at: rec.created_at,
        updated_at: rec.updated_at,
        visited_at: rec.visited_at,
    }
}

/// Severity of a sync status, used to reduce one logical skill's per-agent
/// copies to a single verdict: the worst one the group carries.
fn sync_status_priority(status: &str) -> u8 {
    match status {
        "diverged" => 5,
        "project_newer" => 4,
        "center_newer" => 3,
        "project_only" => 2,
        "in_sync" => 1,
        _ => 0,
    }
}

pub(crate) use crate::core::path_guard::{ensure_dir_within_root, ensure_safe_skill_relative_path};
use crate::core::project_skill_toggle::set_project_skill_enabled_state;

fn remove_workspace_skill_target(path: &Path) -> Result<(), AppError> {
    sync_engine::remove_target(path).map_err(AppError::io)
}

fn ensure_distinct_linked_workspace_roots(
    skills_root: &Path,
    disabled_root: &Path,
) -> Result<(), AppError> {
    let skills_canonical = std::fs::canonicalize(skills_root)?;
    let disabled_canonical = std::fs::canonicalize(disabled_root)?;

    if skills_canonical == disabled_canonical
        || skills_canonical.starts_with(&disabled_canonical)
        || disabled_canonical.starts_with(&skills_canonical)
    {
        return Err(AppError::invalid_input(
            "Skills directory and disabled skills directory must not overlap",
        ));
    }

    Ok(())
}

pub(crate) fn slugify_skill_dir_name(name: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in name.chars().flat_map(|c| c.to_lowercase()) {
        let valid = ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.';
        if valid {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_matches(|c| c == '-' || c == '_' || c == '.');
    if trimmed.is_empty() {
        "skill".to_string()
    } else {
        trimmed.to_string()
    }
}

pub(crate) fn source_ref_matches_skill_path(
    skill_path: &str,
    skill_canonical: Option<&PathBuf>,
    managed: &SkillRecord,
) -> bool {
    let Some(source_ref) = managed.source_ref.as_deref() else {
        return false;
    };
    if source_ref == skill_path {
        return true;
    }
    let Some(skill_canonical) = skill_canonical else {
        return false;
    };
    let Ok(source_canonical) = std::fs::canonicalize(source_ref) else {
        return false;
    };
    source_canonical == *skill_canonical
}

pub(crate) fn find_best_center_match<'a>(
    skill: &project_scanner::ProjectSkillInfo,
    all_managed: &'a [SkillRecord],
) -> Option<&'a SkillRecord> {
    let skill_hash = skill.content_hash.as_deref();
    let canonical_skill_path = std::fs::canonicalize(&skill.path).ok();

    // source_ref is the strongest direct link there is.
    if let Some(managed) = all_managed.iter().find(|managed| {
        source_ref_matches_skill_path(&skill.path, canonical_skill_path.as_ref(), managed)
    }) {
        return Some(managed);
    }

    // A content hash that names exactly one library skill outranks any
    // directory or name evidence: it says the two directories hold the same
    // bytes, while a directory name only says they were once called the same
    // thing. An export written under a slugified name can land on a directory
    // that now reads as a *different* skill (a library holding both
    // "Code Review" and "code-review" exports the first as `code-review`),
    // and this match also decides where an import writes back — binding the
    // wrong row there overwrites the other skill.
    //
    // Only a unique hash qualifies. Several skills sharing one hash is the
    // arbitrary-pick this fix exists to remove, and those fall through to the
    // directory and name layers below.
    if let Some(hash) = skill_hash {
        let mut by_hash = all_managed
            .iter()
            .filter(|managed| managed.content_hash.as_deref() == Some(hash));
        if let Some(first) = by_hash.next() {
            if by_hash.next().is_none() {
                return Some(first);
            }
        }
    }

    // The central directory name is steadier than the frontmatter name:
    // several skills shipped from one repo can share the latter.
    let by_central_dir: Vec<&SkillRecord> = all_managed
        .iter()
        .filter(|managed| {
            Path::new(&managed.central_path)
                .file_name()
                .map(|name| name.to_string_lossy().eq_ignore_ascii_case(&skill.dir_name))
                .unwrap_or(false)
        })
        .collect();
    if let Some(managed) = unique_center_match(&by_central_dir, skill_hash) {
        return Some(managed);
    }

    // Covers the ordinary skill whose name and directory agree.
    let by_name: Vec<&SkillRecord> = all_managed
        .iter()
        .filter(|managed| {
            slugify_skill_dir_name(&managed.name).eq_ignore_ascii_case(&skill.dir_name)
        })
        .collect();
    if let Some(managed) = unique_center_match(&by_name, skill_hash) {
        return Some(managed);
    }

    None
}

/// Pick the one skill among candidates sharing an identity signal,
/// disambiguating by content hash when the signal alone leaves several.
fn unique_center_match<'a>(
    candidates: &[&'a SkillRecord],
    skill_hash: Option<&str>,
) -> Option<&'a SkillRecord> {
    match candidates.len() {
        0 => None,
        1 => Some(candidates[0]),
        _ => {
            let hash = skill_hash?;
            let mut filtered = candidates
                .iter()
                .copied()
                .filter(|managed| managed.content_hash.as_deref() == Some(hash));
            let first = filtered.next()?;
            filtered.next().is_none().then_some(first)
        }
    }
}

pub(crate) fn classify_sync_status(
    skill: &project_scanner::ProjectSkillInfo,
    managed: Option<&SkillRecord>,
) -> String {
    let Some(managed) = managed else {
        return "project_only".to_string();
    };

    // Fast path: compare project hash against DB-stored center hash
    if skill.content_hash.is_some()
        && managed.content_hash.as_deref() == skill.content_hash.as_deref()
    {
        return "in_sync".to_string();
    }

    // The DB hash may be stale, and `updated_at` is the wrong clock for the
    // comparison further down, so read the center from disk once and answer
    // both questions from the same walk.
    let center_entries =
        crate::core::content_hash::list_content_files(Path::new(&managed.central_path));

    if let Some(project_hash) = skill.content_hash.as_deref() {
        if project_hash == crate::core::content_hash::hash_entries(&center_entries) {
            return "in_sync".to_string();
        }
    }

    let Some(project_modified_at) = skill.last_modified_at else {
        return "diverged".to_string();
    };

    // The project side is a filesystem mtime, so the center has to be one too.
    // `updated_at` is a database column stamped when the row was written:
    // editing files in the library does not move it, and a metadata-only write
    // moves it while no content changed. Comparing the two rulers reported
    // "center is newer" for a project copy the user had just edited, and that
    // status invites a pull, which overwrites the edit — the diagnosis behind
    // #328.
    let Some(center_modified_at) = crate::core::content_hash::latest_modified_ms(&center_entries)
    else {
        return "diverged".to_string();
    };
    let threshold_ms = 1_000;
    if project_modified_at > center_modified_at + threshold_ms {
        "project_newer".to_string()
    } else if center_modified_at > project_modified_at + threshold_ms {
        "center_newer".to_string()
    } else {
        "diverged".to_string()
    }
}

static GET_PROJECTS_FIRST_CALL: AtomicBool = AtomicBool::new(true);

#[tauri::command]
pub async fn get_projects(
    store: State<'_, Arc<SkillStore>>,
    metadata_only: Option<bool>,
) -> Result<Vec<ProjectDto>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let start = Instant::now();
        store.prune_recent_projects().map_err(AppError::db)?;
        let records = store.get_all_projects().map_err(AppError::db)?;
        if metadata_only.unwrap_or(false) {
            return Ok(records.iter().map(project_metadata).collect());
        }
        let all_managed = store.get_all_skills().map_err(AppError::db)?;
        let configs = agent_skill_configs(&store);
        let count = records.len();
        let dtos: Vec<ProjectDto> = records
            .iter()
            .map(|r| project_to_dto(r, &all_managed, &configs))
            .collect();
        let elapsed_ms = start.elapsed().as_millis();
        if should_log_first_or_slow(&GET_PROJECTS_FIRST_CALL, elapsed_ms, 100) {
            log::info!("get_projects: {count} projects in {elapsed_ms} ms");
        }
        Ok(dtos)
    })
    .await?
}

#[tauri::command]
pub async fn add_project(
    store: State<'_, Arc<SkillStore>>,
    path: String,
) -> Result<ProjectDto, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let project_path = Path::new(&path);
        if !project_path.is_dir() {
            return Err(AppError::invalid_input("Directory does not exist"));
        }
        let claude_dir = project_path.join(".claude");
        let skills_dir = claude_dir.join("skills");
        let disabled_dir = claude_dir.join("skills-disabled");

        // Support initializing an empty project directory as a managed project.
        std::fs::create_dir_all(&skills_dir)?;
        std::fs::create_dir_all(&disabled_dir)?;

        let name = project_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        let now = chrono::Utc::now().timestamp_millis();
        let record = ProjectRecord {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            path: path.clone(),
            workspace_type: "project".to_string(),
            linked_agent_key: None,
            linked_agent_name: None,
            disabled_path: None,
            sort_order: 0,
            created_at: now,
            updated_at: now,
            visited_at: None,
        };

        store.insert_project(&record).map_err(AppError::db)?;
        let all_managed = store.get_all_skills().map_err(AppError::db)?;
        let configs = agent_skill_configs(&store);
        Ok(project_to_dto(&record, &all_managed, &configs))
    })
    .await?
}

#[tauri::command]
pub async fn add_linked_workspace(
    store: State<'_, Arc<SkillStore>>,
    name: String,
    path: String,
    disabled_path: Option<String>,
) -> Result<ProjectDto, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::invalid_input("Workspace name is required"));
        }

        let skills_root = PathBuf::from(path.trim());
        if !skills_root.is_dir() {
            return Err(AppError::invalid_input("Skills directory does not exist"));
        }

        let disabled_path = disabled_path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        let disabled_path = if let Some(disabled) = disabled_path {
            let disabled_root = PathBuf::from(&disabled);
            if !disabled_root.is_dir() {
                return Err(AppError::invalid_input(
                    "Disabled skills directory does not exist",
                ));
            }
            ensure_distinct_linked_workspace_roots(&skills_root, &disabled_root)?;
            Some(disabled)
        } else {
            let mut disabled_root = skills_root.clone();
            let derived = disabled_root
                .file_name()
                .and_then(|n| n.to_str())
                .map(|name| format!("{}-disabled", name));
            match derived {
                Some(name) => {
                    disabled_root.set_file_name(name);
                    match std::fs::create_dir_all(&disabled_root) {
                        Ok(()) => {
                            ensure_distinct_linked_workspace_roots(&skills_root, &disabled_root)?;
                            Some(disabled_root.to_string_lossy().to_string())
                        }
                        Err(_) => None,
                    }
                }
                None => None,
            }
        };

        let now = chrono::Utc::now().timestamp_millis();
        let record = ProjectRecord {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.clone(),
            path: skills_root.to_string_lossy().to_string(),
            workspace_type: "linked".to_string(),
            linked_agent_key: Some(slugify_skill_dir_name(&name)),
            linked_agent_name: Some(name),
            disabled_path,
            sort_order: 0,
            created_at: now,
            updated_at: now,
            visited_at: None,
        };

        store.insert_project(&record).map_err(AppError::db)?;
        let all_managed = store.get_all_skills().map_err(AppError::db)?;
        let configs = agent_skill_configs(&store);
        Ok(project_to_dto(&record, &all_managed, &configs))
    })
    .await?
}

#[tauri::command]
pub async fn remove_project(store: State<'_, Arc<SkillStore>>, id: String) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || store.delete_project(&id).map_err(AppError::db))
        .await?
}

#[tauri::command]
pub async fn reorder_projects(
    ids: Vec<String>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || store.reorder_projects(&ids).map_err(AppError::db))
        .await?
}

#[tauri::command]
pub async fn touch_project_visited(
    app: tauri::AppHandle,
    id: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    let visits = tauri::async_runtime::spawn_blocking(move || {
        store.touch_project_visited(&id).map_err(AppError::db)?;
        store.project_visit_history().map_err(AppError::db)
    })
    .await??;
    tauri::Emitter::emit(&app, "project-visits-changed", visits).map_err(AppError::io)
}

#[tauri::command]
pub async fn scan_projects(
    root: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<Vec<String>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root_path = Path::new(&root);
        if !root_path.is_dir() {
            return Err(AppError::invalid_input("Directory does not exist"));
        }
        let configs = agent_skill_configs(&store);
        Ok(project_scanner::scan_projects_in_dir(
            root_path, 4, &configs,
        ))
    })
    .await?
}

#[tauri::command]
pub async fn get_project_agent_targets(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
) -> Result<Vec<ProjectAgentTargetDto>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let record = store
            .get_project_by_id(&project_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Workspace not found"))?;
        Ok(project_agent_targets_for_record(&store, &record))
    })
    .await?
}

#[tauri::command]
pub async fn get_project_skills(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
) -> Result<Vec<project_scanner::ProjectSkillInfo>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let record = store
            .get_project_by_id(&project_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Workspace not found"))?;

        let configs = agent_skill_configs(&store);
        let mut skills = read_workspace_skills(&record, &configs);

        let all_managed = store.get_all_skills().unwrap_or_default();
        let tags_map = store.get_tags_map().unwrap_or_default();
        for skill in &mut skills {
            let matched = find_best_center_match(skill, &all_managed);
            skill.in_center = matched.is_some();
            skill.center_skill_id = matched.map(|m| m.id.clone());
            skill.tags = skill
                .center_skill_id
                .as_ref()
                .and_then(|skill_id| tags_map.get(skill_id).cloned())
                .unwrap_or_default();
            skill.sync_status = classify_sync_status(skill, matched);
        }

        Ok(skills)
    })
    .await?
}

#[tauri::command]
pub async fn get_project_skill_document(
    project_id: String,
    skill_relative_path: String,
    agent: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<ProjectSkillDocumentDto, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        ensure_safe_skill_relative_path(&skill_relative_path)?;

        let record = store
            .get_project_by_id(&project_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Workspace not found"))?;

        let (skills_root, disabled_root) = resolve_agent_skills_roots(&store, &record, &agent)
            .ok_or_else(|| AppError::not_found(format!("Unknown workspace agent: {}", agent)))?;
        let disabled_root_copy = disabled_root.clone();
        let skill_dir = skills_root.join(&skill_relative_path);
        let skill_dir = if skill_dir.is_dir() {
            ensure_dir_within_root(&skill_dir, &skills_root)?;
            skill_dir
        } else if let Some(disabled_root) = disabled_root {
            let disabled = disabled_root.join(&skill_relative_path);
            if disabled.is_dir() {
                ensure_dir_within_root(&disabled, &disabled_root)?;
                disabled
            } else {
                return Err(AppError::not_found("Skill directory not found"));
            }
        } else {
            return Err(AppError::not_found("Skill directory not found"));
        };

        // Collect all allowed roots for symlink target validation
        let mut allowed_roots: Vec<PathBuf> = vec![skills_root.clone()];
        if let Some(dr) = disabled_root_copy {
            allowed_roots.push(dr);
        }
        // For project workspaces, also allow the project root itself
        if record.workspace_type != "linked" {
            allowed_roots.push(PathBuf::from(&record.path));
        }

        let candidates = ["SKILL.md", "skill.md", "CLAUDE.md", "README.md"];
        for candidate in &candidates {
            let file_path = skill_dir.join(candidate);
            if !file_path.exists() {
                continue;
            }
            // For symlinks, verify the resolved target stays within an allowed root
            if let Ok(meta) = std::fs::symlink_metadata(&file_path) {
                if meta.file_type().is_symlink() {
                    let resolved = match std::fs::canonicalize(&file_path) {
                        Ok(r) => r,
                        Err(_) => continue, // broken symlink
                    };
                    let in_allowed_root = allowed_roots.iter().any(|root| {
                        std::fs::canonicalize(root)
                            .map(|canon| resolved.starts_with(&canon))
                            .unwrap_or(false)
                    });
                    if !in_allowed_root {
                        continue;
                    }
                }
            }
            if file_path.is_file() {
                let content = std::fs::read_to_string(&file_path)?;
                return Ok(ProjectSkillDocumentDto {
                    skill_name: skill_relative_path,
                    filename: candidate.to_string(),
                    content,
                });
            }
        }

        Err(AppError::not_found(
            "No document file found in skill directory",
        ))
    })
    .await?
}

#[tauri::command]
pub async fn get_project_skill_files(
    project_id: String,
    skill_relative_path: String,
    agent: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<Vec<ProjectSkillFileDto>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        ensure_safe_skill_relative_path(&skill_relative_path)?;
        let record = store
            .get_project_by_id(&project_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Workspace not found"))?;
        let (skills_root, disabled_root) = resolve_agent_skills_roots(&store, &record, &agent)
            .ok_or_else(|| AppError::not_found(format!("Unknown workspace agent: {}", agent)))?;
        let skill_dir = skills_root.join(&skill_relative_path);
        let skill_dir = if skill_dir.is_dir() {
            ensure_dir_within_root(&skill_dir, &skills_root)?;
            skill_dir
        } else if let Some(disabled_root) = disabled_root {
            let disabled = disabled_root.join(&skill_relative_path);
            if !disabled.is_dir() {
                return Err(AppError::not_found("Skill directory not found"));
            }
            ensure_dir_within_root(&disabled, &disabled_root)?;
            disabled
        } else {
            return Err(AppError::not_found("Skill directory not found"));
        };

        let mut files = Vec::new();
        for entry in WalkDir::new(&skill_dir)
            .max_depth(8)
            .into_iter()
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            if let Ok(content) = std::fs::read_to_string(path) {
                let filename = path
                    .strip_prefix(&skill_dir)
                    .map_err(AppError::io)?
                    .to_string_lossy()
                    .replace('\\', "/");
                files.push(ProjectSkillFileDto { filename, content });
            }
        }
        files.sort_by(|a, b| a.filename.cmp(&b.filename));
        Ok(files)
    })
    .await?
}

#[tauri::command]
pub async fn import_project_skill_to_center(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    skill_relative_path: String,
    agent: String,
) -> Result<String, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        ensure_safe_skill_relative_path(&skill_relative_path)?;

        let record = store
            .get_project_by_id(&project_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Workspace not found"))?;

        let configs = agent_skill_configs(&store);
        let skills = read_workspace_skills(&record, &configs);
        let skill = skills
            .iter()
            .find(|s| s.relative_path == skill_relative_path && s.agent == agent)
            .ok_or_else(|| AppError::not_found("Skill not found in workspace"))?;

        let source_path = PathBuf::from(&skill.path);
        let all_managed = store.get_all_skills().unwrap_or_default();
        // Use the same matching logic as the UI (find_best_center_match) to
        // stay consistent with sync-status display. After updating, bind
        // source_ref so future imports match by exact path.
        if let Some(existing) = find_best_center_match(skill, &all_managed) {
            let result = installer::install_from_local_to_destination(
                &source_path,
                Some(&existing.name),
                Path::new(&existing.central_path),
            )
            .map_err(AppError::io)?;
            store
                .update_skill_after_install(
                    &existing.id,
                    &existing.name,
                    result.description.as_deref(),
                    existing.source_revision.as_deref(),
                    existing.remote_revision.as_deref(),
                    Some(&result.content_hash),
                    "local_only",
                )
                .map_err(AppError::db)?;
            // Only update source_ref when the match was already by source_ref
            // path (not by hash or name). This avoids permanently rebinding
            // unrelated center skills that merely share a name or content.
            let already_matched_by_ref = source_ref_matches_skill_path(
                &skill.path,
                std::fs::canonicalize(&skill.path).ok().as_ref(),
                existing,
            );
            if existing.source_type == "local" && already_matched_by_ref {
                store
                    .update_skill_source_ref(&existing.id, &skill.path)
                    .map_err(AppError::db)?;
            }
            return Ok(existing.id.clone());
        }

        let result =
            installer::install_from_local(&source_path, Some(&skill.name)).map_err(AppError::io)?;

        let now = chrono::Utc::now().timestamp_millis();
        let id = uuid::Uuid::new_v4().to_string();

        let skill_record = SkillRecord {
            id: id.clone(),
            name: result.name.clone(),
            description: result.description.clone(),
            source_type: "local".to_string(),
            source_ref: Some(skill.path.clone()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: result.central_path.to_string_lossy().to_string(),
            content_hash: Some(result.content_hash.clone()),
            enabled: true,
            created_at: now,
            updated_at: now,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: Some(now),
            last_check_error: None,
        };

        store.insert_skill(&skill_record).map_err(AppError::db)?;

        Ok(id)
    })
    .await?
}

#[tauri::command]
pub async fn update_project_skill_to_center(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    skill_relative_path: String,
    agent: String,
) -> Result<String, AppError> {
    import_project_skill_to_center(store, project_id, skill_relative_path, agent).await
}

#[tauri::command]
pub fn slugify_skill_names(names: Vec<String>) -> Vec<String> {
    names.iter().map(|n| slugify_skill_dir_name(n)).collect()
}

#[tauri::command]
pub async fn export_skill_to_project(
    store: State<'_, Arc<SkillStore>>,
    skill_id: String,
    project_id: String,
    agents: Option<Vec<String>>,
    copy: Option<bool>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let project = store
            .get_project_by_id(&project_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Workspace not found"))?;

        let skill = store
            .get_skill_by_id(&skill_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Skill not found"))?;

        if project.workspace_type != "linked" {
            let keys = agents
                .filter(|keys| !keys.is_empty())
                .unwrap_or_else(|| vec!["claude_code".into()]);
            let targets = keys
                .iter()
                .map(|key| {
                    tool_adapters::find_adapter_with_store(&store, key)
                        .ok_or_else(|| AppError::not_found(format!("Unknown agent: {key}")))
                })
                .collect::<Result<Vec<_>, _>>()?;
            crate::core::project_library::install_with_mode(
                Path::new(&project.path),
                &skill,
                &targets,
                matches!(
                    crate::core::deployment_preferences::Preference::load(
                        &store,
                        crate::core::deployment_preferences::Scope::Project,
                    )?
                    .for_install(copy),
                    sync_engine::SyncMode::Copy
                ),
            )?;
            return Ok(());
        }

        let source = PathBuf::from(&skill.central_path);
        let dir_name = sync_engine::target_dir_name(&source, &skill.name);
        ensure_safe_skill_relative_path(&dir_name)?;
        let requested_agent_keys = agents.filter(|items| !items.is_empty()).unwrap_or_else(|| {
            if project.workspace_type == "linked" {
                vec![linked_workspace_agent_key(&project)]
            } else {
                vec!["claude_code".to_string()]
            }
        });
        let agent_keys = requested_agent_keys;

        for agent_key in &agent_keys {
            let (skills_root, disabled_root) =
                resolve_agent_skills_roots(&store, &project, agent_key)
                    .ok_or_else(|| AppError::not_found(format!("Unknown agent: {}", agent_key)))?;
            let target_dir = skills_root.join(&dir_name);

            if target_dir.strip_prefix(&skills_root).is_err() {
                return Err(AppError::invalid_input("Invalid skill directory path"));
            }

            if target_dir.exists()
                || disabled_root
                    .as_ref()
                    .map(|path| path.join(&dir_name).exists())
                    .unwrap_or(false)
            {
                return Err(AppError::invalid_input(format!(
                    "Skill \"{}\" already exists in this workspace for agent {}",
                    skill.name, agent_key
                )));
            }
        }

        let preference = crate::core::deployment_preferences::Preference::load(
            &store,
            crate::core::deployment_preferences::Scope::Linked,
        )?;
        // Two agents can resolve to the same project skills root, in which case
        // the second pass would find the directory the first just wrote and
        // refuse it. The artifact is already correct, so skip instead.
        let mut written: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();
        for agent_key in &agent_keys {
            let (skills_root, _) = resolve_agent_skills_roots(&store, &project, agent_key)
                .ok_or_else(|| AppError::not_found(format!("Unknown agent: {}", agent_key)))?;
            let target_dir = skills_root.join(&dir_name);
            if !written.insert(target_dir.clone()) {
                continue;
            }
            std::fs::create_dir_all(&skills_root)?;
            let mode = preference.for_install(copy);
            // NoClobber: the loop above already refused every pre-existing
            // target, so nothing here should need replacing. Belt and braces —
            // `exists()` misses dangling links and is racy against this write.
            sync_engine::sync_skill(
                &source,
                &target_dir,
                mode,
                sync_engine::ReplacePolicy::NoClobber,
            )
            .map_err(AppError::io)?;
        }

        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn toggle_project_skill(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    skill_relative_path: String,
    agent: String,
    enabled: bool,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        ensure_safe_skill_relative_path(&skill_relative_path)?;

        let record = store
            .get_project_by_id(&project_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Workspace not found"))?;

        if record.workspace_type != "linked"
            && crate::core::project_library::is_managed(
                Path::new(&record.path),
                &skill_relative_path,
            )?
        {
            let shared =
                resolve_agent_skills_roots(&store, &record, &agent).is_some_and(|(root, _)| {
                    root == Path::new(&record.path)
                        .join(crate::core::project_library::SKILLS_DIRECTORY)
                });
            if shared {
                crate::core::project_library::set_enabled(
                    Path::new(&record.path),
                    &skill_relative_path,
                    enabled,
                )?;
                return Ok(());
            }
            crate::core::project_library::set_target_enabled(
                Path::new(&record.path),
                &skill_relative_path,
                &agent,
                enabled,
            )?;
            return Ok(());
        }

        let (skills_dir, disabled_dir) = resolve_agent_skills_roots(&store, &record, &agent)
            .ok_or_else(|| AppError::not_found(format!("Unknown agent: {}", agent)))?;
        let disabled_dir = disabled_dir.ok_or_else(|| {
            AppError::invalid_input("This workspace does not support disabling skills")
        })?;

        set_project_skill_enabled_state(&skills_dir, &disabled_dir, &skill_relative_path, enabled)
    })
    .await?
}

#[tauri::command]
pub async fn delete_project_skill(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    skill_relative_path: String,
    agent: String,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        ensure_safe_skill_relative_path(&skill_relative_path)?;

        let record = store
            .get_project_by_id(&project_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Workspace not found"))?;

        if record.workspace_type != "linked"
            && crate::core::project_library::is_managed(
                Path::new(&record.path),
                &skill_relative_path,
            )?
        {
            let shared = resolve_agent_skills_roots(&store, &record, &agent)
                .is_some_and(|(root, _)| root == Path::new(&record.path).join(crate::core::project_library::SKILLS_DIRECTORY));
            if shared {
                return Err(AppError::invalid_input("Shared project content is visible to multiple Agents. Use project Skill deletion or shared project disable instead."));
            }
            let adapter = tool_adapters::find_adapter_with_store(&store, &agent)
                .ok_or_else(|| AppError::not_found(format!("Unknown agent: {agent}")))?;
            crate::core::project_library::remove_target_with_adapter(
                Path::new(&record.path),
                &skill_relative_path,
                &adapter,
            )?;
            return Ok(());
        }

        let (skills_root, disabled_root) = resolve_agent_skills_roots(&store, &record, &agent)
            .ok_or_else(|| AppError::not_found(format!("Unknown agent: {}", agent)))?;
        let skills_dir = skills_root.join(&skill_relative_path);
        let disabled_dir = disabled_root
            .as_ref()
            .map(|root| root.join(&skill_relative_path));

        let (target, target_root) = if skills_dir.is_dir() {
            (skills_dir, skills_root)
        } else if let Some(disabled_dir) = disabled_dir.filter(|path| path.is_dir()) {
            (
                disabled_dir,
                disabled_root.expect("present when disabled_dir exists"),
            )
        } else {
            return Ok(());
        };

        ensure_dir_within_root(&target, &target_root)?;
        remove_workspace_skill_target(&target)?;
        Ok(())
    })
    .await?
}

#[cfg(test)]
mod tests;
