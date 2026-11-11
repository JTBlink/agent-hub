pub mod agent_execution;
pub mod agent_launch_config;
pub mod agent_launcher;
pub mod agent_runtime;
pub mod agent_usage;
pub mod app_state;
#[cfg(not(feature = "github"))]
#[path = "platforms/disabled_updates.rs"]
pub mod app_updates;
#[cfg(feature = "github")]
pub use platforms::github::updates as app_updates;
pub mod audit_log;
#[cfg(feature = "cloud-sync")]
pub mod auto_backup;
pub mod automation;
#[cfg(feature = "cloud-sync")]
pub mod backup_workspace;
pub mod central_repo;
pub mod cli_bridge;
pub mod clipboard;
pub(crate) mod cloud_sync;
pub mod content_hash;
mod credential_cache;
mod credential_file;
pub mod crypto;
pub mod deployment_preferences;
pub mod error;
pub mod file_preview;
pub mod file_watcher;
#[cfg(feature = "github")]
pub(crate) use platforms::github::credentials as gh_credentials;
#[cfg(feature = "cloud-sync")]
pub mod git2_engine;
pub(crate) mod git_auth_source;
#[cfg(feature = "cloud-sync")]
pub mod git_backup;
pub mod git_catalog;
pub mod git_credentials;
#[cfg(any(feature = "cloud-sync", test))]
pub(crate) mod git_failure;
pub mod git_fetcher;
pub mod git_skill_sync;
#[cfg(feature = "github")]
pub use platforms::github::backup_api as github_api;
pub mod hosts;
pub mod install_cancel;
pub mod installer;
pub mod log_sanitize;
#[cfg(feature = "cloud-sync")]
pub mod merge;
pub mod migrations;
pub mod panic_log;
pub mod path_guard;
pub(crate) mod platforms;
pub mod project_library;
pub mod project_scanner;
pub(crate) mod project_skill_mutation;
pub(crate) mod project_skill_toggle;
pub(crate) mod python_support;
pub mod removals;
pub mod repo_lock;
pub mod scanner;
pub mod scenario_service;
mod shared_library;
pub(crate) mod shared_skill_index;
pub mod skill_auto_updater;
mod skill_deployment;
pub mod skill_metadata;
pub mod skill_rename;
pub mod skill_store;
pub mod skill_versions;
pub mod skillssh_api;
pub mod state_store;
pub mod sync_engine;
pub mod sync_metadata;
pub(crate) mod system_authorization;
pub mod system_load;
pub mod timing;
pub mod tool_adapters;
mod tool_detection;
pub mod tool_service;

pub mod terminal;

#[cfg(feature = "herdr")]
pub mod herdr;

pub(crate) mod cli_process;

pub mod task_browser;

pub mod project_paths;

pub mod project_file_actions;
pub mod project_file_edit;
pub mod project_git;
pub mod project_worktrees;
pub mod worktree_search;

pub mod preview;

pub mod user_config;

pub mod system_permissions;

pub mod project_images;

pub mod workspace_registration;
