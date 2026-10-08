#[path = "central_repo_migration.rs"]
mod migration;
use anyhow::{anyhow, Context, Result};
use migration::migrate_repo_if_needed;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use walkdir::WalkDir;

const CONFIG_FILE_NAME: &str = "repo-config.json";

static BASE_DIR_OVERRIDE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
/// Test-only redirection of the home directory, so a test can exercise paths
/// that are deliberately *not* relocatable by the user (see `cli_bridge`).
static HOME_DIR_OVERRIDE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
static SKILLS_DIR_OVERRIDE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
static STARTUP_WARNINGS: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
static STARTUP_ERROR_LOG: OnceLock<Mutex<Vec<String>>> = OnceLock::new();

fn push_startup_warning(code: &str) {
    let mut warnings = STARTUP_WARNINGS
        .get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if !warnings.iter().any(|w| w == code) {
        warnings.push(code.to_string());
    }
}

/// Warning codes recorded while resolving the central repository at startup.
/// The frontend maps them to localized banner text (`settings.repoWarning_*`).
pub fn startup_warnings() -> Vec<String> {
    STARTUP_WARNINGS
        .get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

/// Record a detailed startup error for later logging. `ensure_central_repo`
/// runs before `tauri_plugin_log` is installed (see `run()` in lib.rs), so a
/// `log::error!` here is swallowed by the default no-op logger. Stash the
/// detail and let `setup` flush it once the real logger exists.
pub(crate) fn record_startup_error(message: String) {
    STARTUP_ERROR_LOG
        .get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .push(message);
}

/// Drain the startup errors stashed by [`record_startup_error`]. Called from
/// `tauri::Builder::setup` once the logger is up so the detail lands in the log
/// file that a support bundle collects.
pub fn take_startup_errors() -> Vec<String> {
    let mut guard = STARTUP_ERROR_LOG
        .get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    std::mem::take(&mut guard)
}

/// Global mutex shared by every test that mutates the base-dir override via
/// [`set_test_base_dir_override`]. The override is process-wide static state,
/// so any two tests holding their own per-module locks can still race. Tests
/// must take this guard before calling `set_test_base_dir_override` and keep
/// it alive until they restore the previous value.
#[cfg(test)]
static TEST_BASE_DIR_GUARD: OnceLock<Mutex<()>> = OnceLock::new();

#[cfg(test)]
pub(crate) fn test_base_dir_lock() -> std::sync::MutexGuard<'static, ()> {
    TEST_BASE_DIR_GUARD
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct RepoPathConfig {
    repo_path: Option<String>,
    pending_migration_from: Option<String>,
    /// Where the library lived before a move that has completed. Links and DB
    /// paths still pointing there are rewritten once the store is open, then
    /// this is cleared (see [`take_repoint_from`]).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    repoint_from: Option<String>,
}

fn default_base_dir() -> PathBuf {
    home_base_dir()
}

/// `~/.agent-hub`, ignoring any configured relocation.
///
/// The library can be moved anywhere the user likes, but a few things must
/// stay where another program can find them without being told — the CLI
/// bridge an agent runs, above all. Those use this rather than [`base_dir`].
pub fn home_base_dir() -> PathBuf {
    if let Some(path) = HOME_DIR_OVERRIDE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap()
        .clone()
    {
        return path.join(".agent-hub");
    }
    dirs::home_dir()
        .expect("Cannot determine home directory")
        .join(".agent-hub")
}

#[cfg(test)]
pub(crate) fn set_test_home_dir_override(path: Option<PathBuf>) {
    *HOME_DIR_OVERRIDE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap() = path;
}

/// Logs stay with the application identity even when the skill library moves.
pub fn log_dir() -> PathBuf {
    home_base_dir().join("logs")
}

fn config_file_path() -> PathBuf {
    home_base_dir().join(CONFIG_FILE_NAME)
}

/// Distinguishes "no config file" (normal fresh install) from "config file
/// exists but cannot be used" (must never be silently treated as a fresh
/// install — that is how a configured library turns into an empty default
/// one and users report "all my skills are gone", issue #228 review).
#[derive(Debug)]
enum ConfigState {
    Missing,
    Valid(RepoPathConfig),
    Invalid(String),
}

fn load_config_state_from(path: &Path) -> ConfigState {
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return ConfigState::Missing,
        Err(err) => {
            return ConfigState::Invalid(format!("cannot read {}: {err}", path.display()));
        }
    };
    match serde_json::from_str(&raw) {
        Ok(config) => ConfigState::Valid(config),
        Err(err) => ConfigState::Invalid(format!("corrupt JSON in {}: {err}", path.display())),
    }
}

fn load_config_state() -> ConfigState {
    load_config_state_from(&config_file_path())
}

fn load_config() -> RepoPathConfig {
    match load_config_state() {
        ConfigState::Valid(config) => config,
        ConfigState::Missing | ConfigState::Invalid(_) => RepoPathConfig::default(),
    }
}

fn save_config(config: &RepoPathConfig) -> Result<()> {
    let path = config_file_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    use std::io::Write;
    let mut file =
        tempfile::NamedTempFile::new_in(path.parent().context("Missing config parent")?)?;
    file.write_all(&serde_json::to_vec_pretty(config)?)?;
    file.as_file().sync_all()?;
    file.persist(path)?;
    Ok(())
}

fn normalize_path(raw: &str) -> Result<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("Path cannot be empty"));
    }

    let expanded = if trimmed == "~" {
        dirs::home_dir().ok_or_else(|| anyhow!("Cannot determine home directory"))?
    } else if trimmed.starts_with("~/") || trimmed.starts_with("~\\") {
        dirs::home_dir()
            .ok_or_else(|| anyhow!("Cannot determine home directory"))?
            .join(&trimmed[2..])
    } else {
        PathBuf::from(trimmed)
    };

    if !expanded.is_absolute() {
        return Err(anyhow!("Central repository path must be absolute"));
    }

    let mut normalized = PathBuf::new();
    for component in expanded.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    Ok(normalized)
}

pub fn configured_base_dir() -> Option<PathBuf> {
    load_config()
        .repo_path
        .and_then(|path| normalize_path(&path).ok())
}

/// Where the user asked the library to live (takes effect at the next launch).
fn requested_base_from(config: &RepoPathConfig) -> PathBuf {
    config
        .repo_path
        .as_deref()
        .and_then(|path| normalize_path(path).ok())
        .unwrap_or_else(default_base_dir)
}

/// Where the library actually is: the source of a move that hasn't happened
/// yet, otherwise the requested location. Saving a new path therefore never
/// switches a running session — the move happens at the next launch.
fn live_base_from(config: &RepoPathConfig) -> PathBuf {
    if let Some(source) = config
        .pending_migration_from
        .as_deref()
        .and_then(|path| normalize_path(path).ok())
    {
        if source.is_dir() {
            return source;
        }
    }
    requested_base_from(config)
}

pub fn base_dir() -> PathBuf {
    if let Some(path) = BASE_DIR_OVERRIDE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap()
        .clone()
    {
        return path;
    }

    live_base_from(&load_config())
}

/// The location a pending move will go to at the next launch, if any.
pub fn pending_base_dir() -> Option<PathBuf> {
    if base_dir_override_active() {
        return None;
    }
    let config = load_config();
    let requested = requested_base_from(&config);
    (live_base_from(&config) != requested).then_some(requested)
}

/// Whether an explicit runtime base-dir override is active (CLI `--skills-root`
/// / `--path`). Startup migration is skipped when it is — the caller chose a
/// specific library and the app's shared pending-migration marker doesn't apply.
fn base_dir_override_active() -> bool {
    BASE_DIR_OVERRIDE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .is_some()
}

pub fn set_runtime_base_dir_override(path: Option<PathBuf>) {
    *BASE_DIR_OVERRIDE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap() = path;
}

pub fn set_runtime_skills_dir_override(path: Option<PathBuf>) {
    *SKILLS_DIR_OVERRIDE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap() = path;
}

#[cfg(test)]
pub(crate) fn set_test_base_dir_override(path: Option<PathBuf>) {
    set_runtime_base_dir_override(path);
    set_runtime_skills_dir_override(None);
}

pub fn skills_dir() -> PathBuf {
    if let Some(path) = SKILLS_DIR_OVERRIDE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap()
        .clone()
    {
        return path;
    }
    if base_dir_override_active() {
        return base_dir().join("skills");
    }
    let home = home_base_dir();
    let base = base_dir();
    if base != home && !super::shared_library::activated(&home) {
        return base.join("skills");
    }
    super::shared_library::active_root(&home, &base.join("skills"), &default_skills_dir())
}

/// Shared Skills contents; database, config and logs remain in the app home.
pub fn default_skills_dir() -> PathBuf {
    if let Some(home) = HOME_DIR_OVERRIDE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap()
        .clone()
    {
        return home.join(".agents/skills");
    }
    super::tool_adapters::shared_skills_dir()
}

pub(crate) fn take_shared_repoint_from() -> Result<Option<(PathBuf, PathBuf)>> {
    if base_dir_override_active() {
        return Ok(None);
    }
    Ok(super::shared_library::pending_repoint(&home_base_dir())?
        .map(|from| (from, default_skills_dir())))
}

pub(crate) fn clear_shared_repoint_from() -> Result<()> {
    super::shared_library::finish_repoint(&home_base_dir())
}

/// Derive a stable per-skills-root state directory under the user's default base.
///
/// CLI's `--skills-root` lets agents operate on an external skills checkout
/// (e.g. a freshly cloned `my-skills`) without touching the app's default repo.
/// The manager still needs a home for its DB, scenarios, cache, and logs — but
/// putting that state inside the external checkout would pollute the user's
/// repo, and putting it in the parent directory would silently litter wherever
/// the user happened to clone. Instead, namespace the state under
/// `<default-base>/external/<sanitized-name>-<short-hash>/`, keyed by the
/// canonical path of the skills root so repeat invocations reuse the same DB.
pub fn external_base_dir(skills_root: &Path) -> PathBuf {
    // canonicalize() requires the path to exist. For not-yet-cloned targets we
    // still want a stable namespace, so fall back to absolutizing + lexically
    // normalizing the path. Without this, `./my-skills`, `my-skills`, and
    // `a/../my-skills` would hash to different namespaces despite resolving
    // to the same location.
    let canonical = match skills_root.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            let absolute = if skills_root.is_absolute() {
                skills_root.to_path_buf()
            } else {
                std::env::current_dir()
                    .map(|cwd| cwd.join(skills_root))
                    .unwrap_or_else(|_| skills_root.to_path_buf())
            };
            lexically_normalize(&absolute)
        }
    };
    let name = canonical
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("external");
    let mut hasher = Sha256::new();
    hasher.update(canonical.to_string_lossy().as_bytes());
    let digest = hasher.finalize();
    let short_hash: String = digest
        .iter()
        .take(5)
        .map(|b| format!("{:02x}", b))
        .collect();
    default_base_dir()
        .join("external")
        .join(format!("{}-{}", sanitize_dir_name(name), short_hash))
}

/// Lexically normalize `.` and `..` segments without touching the filesystem.
/// `..` over a normal segment cancels it; `..` over a root or another `..`
/// is preserved (so we don't pretend to escape the filesystem root).
fn lexically_normalize(path: &Path) -> PathBuf {
    use std::path::Component;
    let mut out: Vec<Component> = Vec::new();
    for comp in path.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => match out.last() {
                Some(Component::Normal(_)) => {
                    out.pop();
                }
                Some(Component::RootDir) | Some(Component::Prefix(_)) => {
                    // can't go above root — drop the `..`
                }
                _ => out.push(comp),
            },
            other => out.push(other),
        }
    }
    out.iter().collect()
}

fn sanitize_dir_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "external".to_string()
    } else {
        cleaned
    }
}

pub fn scenarios_dir() -> PathBuf {
    base_dir().join("scenarios")
}

pub fn cache_dir() -> PathBuf {
    base_dir().join("cache")
}

pub fn db_path() -> PathBuf {
    base_dir().join("agent-hub.db")
}

pub fn set_base_dir_override(path: Option<String>) -> Result<PathBuf> {
    let mut config = load_config();

    // Resolve from the persisted config, never `base_dir()`: a runtime override
    // (CLI `--skills-root`) is not where the app's library lives. Changing the
    // path twice before a restart still migrates from where the data really is.
    let data_location = live_base_from(&config);

    let (next, persist_repo_path) = match path {
        Some(raw) => (normalize_path(&raw)?, true),
        None => (default_base_dir(), false),
    };

    config.repo_path = if persist_repo_path {
        Some(next.to_string_lossy().to_string())
    } else {
        None
    };
    config.pending_migration_from = if next != data_location {
        Some(data_location.to_string_lossy().to_string())
    } else {
        None
    };
    save_config(&config)?;
    Ok(next)
}

/// Every process using the app's library holds this lease shared for its
/// whole life; moving the library takes it exclusively. So a move happens only
/// while nothing else has the library open (a running app, an agent's CLI call,
/// a second launch), and whoever starts mid-move waits for it to finish. The
/// file lives next to the config, which never moves with the library.
static LIBRARY_LEASE: OnceLock<Mutex<Option<fs::File>>> = OnceLock::new();

fn lease_slot() -> std::sync::MutexGuard<'static, Option<fs::File>> {
    LIBRARY_LEASE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

/// Take the lease for the rest of this process. Returns whether it is held
/// exclusively — only then may this process move the library. Without a lock
/// file (unwritable config dir) nobody moves anything, which is safe.
fn take_library_lease(try_exclusive: bool) -> bool {
    use fs2::FileExt;
    let mut slot = lease_slot();
    if slot.is_some() {
        return false;
    }
    let path = config_file_path().with_file_name("library.lock");
    let file = path
        .parent()
        .and_then(|parent| fs::create_dir_all(parent).ok())
        .and_then(|_| {
            fs::OpenOptions::new()
                .create(true)
                .truncate(false)
                .write(true)
                .open(&path)
                .ok()
        });
    let Some(file) = file else {
        return false;
    };
    // Fully qualified: newer std `File` has inherent lock methods of the same
    // names; keep every call on one implementation.
    let exclusive = try_exclusive && FileExt::try_lock_exclusive(&file).is_ok();
    if !exclusive {
        // Blocks only while another process is moving the library.
        let _ = FileExt::lock_shared(&file);
    }
    *slot = Some(file);
    exclusive
}

/// After a move, go back to sharing the library with other processes.
fn downgrade_library_lease() {
    use fs2::FileExt;
    if let Some(file) = lease_slot().as_ref() {
        let _ = FileExt::unlock(file);
        let _ = FileExt::lock_shared(file);
    }
}

/// Take the pre-move location recorded by a completed move, if links and DB
/// paths pointing there still need rewriting. Call [`clear_repoint_from`] once
/// that is done, so a crash in between retries at the next launch.
pub fn take_repoint_from() -> Option<(PathBuf, PathBuf)> {
    if base_dir_override_active() {
        return None;
    }
    let config = load_config();
    let from = normalize_path(config.repoint_from.as_deref()?).ok()?;
    Some((from, base_dir()))
}

pub fn clear_repoint_from() -> Result<()> {
    let mut config = load_config();
    if config.repoint_from.take().is_some() {
        save_config(&config)?;
    }
    Ok(())
}

/// `allow_migration`: whether this process may carry out a pending move. Only
/// the app at startup and an explicit CLI `repo set-path` do; everything else
/// keeps running against the library where it is.
pub fn ensure_central_repo(allow_migration: bool) -> Result<()> {
    // A config file that exists but cannot be used means the app is about to
    // run against the default location even though the user configured (and
    // populated) another one. Never let that pass silently — it presents as
    // "the library was rebuilt empty, all skills lost" (#228 review).
    let mut config = match load_config_state() {
        ConfigState::Valid(config) => {
            if let Some(raw) = config.repo_path.as_deref() {
                if let Err(err) = normalize_path(raw) {
                    log::error!(
                        "central repo: configured repo_path {raw:?} is invalid ({err}); \
                         falling back to the default location"
                    );
                    push_startup_warning("repo_path_invalid");
                }
            }
            config
        }
        ConfigState::Missing => RepoPathConfig::default(),
        ConfigState::Invalid(detail) => {
            log::error!(
                "central repo: config is unreadable ({detail}); \
                 falling back to the default location"
            );
            push_startup_warning("config_unreadable");
            RepoPathConfig::default()
        }
    };

    // Only auto-migrate the app's own config-driven base. When a runtime base
    // override is active (CLI `--skills-root` / `--path`), the pending marker in
    // the shared config belongs to a different library and must not be applied
    // to — or override — the explicitly chosen root. The app's own startup never
    // sets an override before this point, so the #252 path is unaffected.
    // A `--skills-root` run keeps its state under the default home too, so it
    // shares the lease; it just never moves the app's library.
    let override_active = base_dir_override_active();
    let migrate_shared = !override_active
        && base_dir() == home_base_dir()
        && !super::shared_library::activated(&home_base_dir());
    let may_move = take_library_lease(
        allow_migration
            && !override_active
            && (migrate_shared || config.pending_migration_from.is_some()),
    );
    if may_move {
        // Re-read: another process may have finished a move while we waited.
        config = load_config();
        let pending_before = config.pending_migration_from.clone();
        let target = requested_base_from(&config);
        let _ = migrate_repo_if_needed(&mut config, &target);
        if config.pending_migration_from != pending_before {
            if let Err(err) = save_config(&config) {
                record_startup_error(format!(
                    "central repo: failed to persist migration state ({err}); it may retry next launch"
                ));
            }
        }
        if base_dir() == home_base_dir() && !super::shared_library::activated(&home_base_dir()) {
            fs::create_dir_all(
                default_skills_dir()
                    .parent()
                    .context("Missing shared Skills parent")?,
            )?;
            if let Err(err) = super::shared_library::migrate(
                &home_base_dir(),
                &base_dir().join("skills"),
                &default_skills_dir(),
            ) {
                record_startup_error(format!(
                    "Shared Skills migration was not completed: {err:#}"
                ));
                push_startup_warning("shared_skills_conflict");
            }
        }
        downgrade_library_lease();
    }
    // Re-resolve: a completed move changed the base.

    let dirs = [skills_dir(), scenarios_dir(), cache_dir(), log_dir()];
    for d in &dirs {
        fs::create_dir_all(d)?;
    }

    Ok(())
}

#[cfg(test)]
#[path = "central_repo_tests.rs"]
mod tests;
