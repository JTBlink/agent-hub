pub mod agent_control;
pub mod agent_launch;
pub mod agent_usage;
pub mod agent_workspace;
pub mod app_updates;
pub mod automation;
pub mod browse;
pub mod developer_tools;
pub mod dialog;
pub mod discovered_skills;
pub mod file_preview;
#[cfg(feature = "cloud-sync")]
pub mod git_backup;
pub mod git_repositories;
#[cfg(all(feature = "cloud-sync", feature = "github"))]
pub mod github;
pub mod hosts;
pub mod ipc;
pub mod project_library;
pub mod project_skill_diff;
pub mod project_skill_update;
pub mod projects;
pub mod scan;
pub mod settings;
pub mod skill_groups;
pub mod skills;
mod skills_diff_metadata;
mod skills_update_policy;
pub mod sync;
pub mod system_load;
pub mod tools;

pub mod local_cleanup;

pub mod terminal;
pub mod terminal_clipboard;

#[cfg(feature = "herdr")]
pub mod herdr;

pub mod task_browser;

pub mod project_git;
pub mod project_worktrees;

pub mod preview;
pub mod preview_cookies;
pub mod preview_native;

pub mod system_permissions;

#[tauri::command]
pub fn get_build_info() -> crate::product::BuildInfo {
    crate::product::current()
}

pub mod platform_accounts;

pub mod project_images;

pub mod workspaces;
