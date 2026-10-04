//! Host configuration and workspace commands; Skills are managed by the independent module.

use super::*;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WorkspaceScanResult {
    pub(super) workspace: persistence::WorkspaceRecord,
    pub(super) configs: Vec<ConfigDocument>,
    pub(super) instructions: Vec<InstructionFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct InstructionFile {
    pub(super) path: String,
    pub(super) kind: String,
    pub(super) scope: Scope,
    pub(super) is_symlink: bool,
}

pub(super) fn discover_instruction_files(root: &Path) -> Vec<InstructionFile> {
    const MAX_DEPTH: usize = 16;
    const MAX_ENTRIES: usize = 20_000;
    const MAX_INSTRUCTION_FILES: usize = 500;
    discover_instruction_files_with_limits(root, MAX_DEPTH, MAX_ENTRIES, MAX_INSTRUCTION_FILES)
}

pub(super) fn discover_instruction_files_with_limits(
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
            let is_symlink = file_type.is_symlink();
            if file_type.is_dir() {
                if is_symlink {
                    continue;
                }
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
                is_symlink,
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

pub(super) fn workspace_input(path: &str) -> Result<persistence::NewWorkspace, String> {
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

pub(super) fn config_index(document: &ConfigDocument) -> persistence::ConfigIndex {
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

pub(super) fn register_global_config(
    state: &AppState,
    document: &ConfigDocument,
) -> Result<(), String> {
    let id = state
        .config_metadata
        .upsert_config_index(None, &config_index(document))
        .map_err(|error| error.to_string())?;
    state.authorize(document, id)
}

#[tauri::command]
pub(super) fn list_workspaces(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<persistence::WorkspaceRecord>, String> {
    state
        .workspaces
        .list_workspaces()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(super) fn add_workspace(
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
pub(super) fn remove_workspace(
    workspace_id: i64,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    remove_workspace_record(&state, workspace_id)
}

pub(super) fn remove_workspace_record(state: &AppState, workspace_id: i64) -> Result<bool, String> {
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
pub(super) fn scan_workspace(
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
    Ok(WorkspaceScanResult {
        workspace: workspace_record,
        configs,
        instructions: discover_instruction_files(&root),
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct InstructionSymlinkResult {
    pub(super) link_path: String,
    pub(super) target_path: String,
}

#[tauri::command]
pub(super) fn create_claude_instruction_symlink(
    workspace_path: String,
) -> Result<InstructionSymlinkResult, String> {
    let workspace = workspace_input(&workspace_path)?;
    let root = PathBuf::from(&workspace.normalized_path);
    let source = root.join("AGENTS.md");
    let destination = root.join("CLAUDE.md");
    let source_metadata = fs::symlink_metadata(&source)
        .map_err(|_| "工作空间根目录没有找到 AGENTS.md，无法创建软链接。".to_owned())?;
    if source_metadata.file_type().is_symlink() || !source_metadata.is_file() {
        return Err("AGENTS.md 必须是真实文件，不能是软链接。".to_owned());
    }
    if let Ok(metadata) = fs::symlink_metadata(&destination) {
        if !metadata.file_type().is_symlink() {
            return Err("CLAUDE.md 已存在真实文件，为避免覆盖未创建软链接。".to_owned());
        }
        let target = fs::read_link(&destination).map_err(|error| error.to_string())?;
        if target == source || target == Path::new("../AGENTS.md") {
            return Ok(InstructionSymlinkResult {
                link_path: destination.to_string_lossy().into_owned(),
                target_path: source.to_string_lossy().into_owned(),
            });
        }
        return Err("CLAUDE.md 已指向其他目标，未修改。".to_owned());
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink("AGENTS.md", &destination).map_err(|error| error.to_string())?;
    #[cfg(windows)]
    std::os::windows::fs::symlink_file("AGENTS.md", &destination)
        .map_err(|error| error.to_string())?;
    Ok(InstructionSymlinkResult {
        link_path: destination.to_string_lossy().into_owned(),
        target_path: source.to_string_lossy().into_owned(),
    })
}
