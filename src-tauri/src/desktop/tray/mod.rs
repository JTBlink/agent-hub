//! Native tray menu, actions, and refresh scheduling.

mod text;

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{Emitter, Manager};

use super::lifecycle::{quit_app, restore_main_window};
use crate::{commands, core};
use text::{
    format_status_line, format_tooltip, format_updates_label, skill_group_menu_label, TrayLanguage,
};

/// Guards concurrent skill group apply/remove from the tray so a quick double-click
/// can't fire two batches at once. Intentionally separate from the
/// `TRAY_CHECK_UPDATES_RUNNING` flag — update checks only touch
/// `update_status` while skill group apply touches `skill_targets`, so the two are
/// orthogonal and shouldn't block each other. Sharing the lock would silently
/// drop skill group clicks during long-running update checks.
static TRAY_SKILL_GROUP_APPLY_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Tracks whether a manual "Check for skill updates" is currently running so the
/// tray menu can render a disabled "Checking for updates..." label.
static TRAY_CHECK_UPDATES_RUNNING: AtomicBool = AtomicBool::new(false);

const MAIN_TRAY_ID: &str = "main-tray";
const TRAY_SKILL_GROUP_ADD_PREFIX: &str = "tray-skill-group-add:";
const TRAY_SKILL_GROUP_REMOVE_PREFIX: &str = "tray-skill-group-remove:";
const TRAY_OPEN_UPDATES_ID: &str = "tray-open-updates";
const TRAY_OPEN_FOLDER_ID: &str = "tray-open-folder";
const TRAY_CHECK_UPDATES_ID: &str = "tray-check-updates";
const TRAY_OPEN_UPDATES_EVENT: &str = "tray-open-updates";

const CUSTOM_TRAY_ICON_BYTES: &[u8] =
    include_bytes!(concat!(env!("AGENT_HUB_ICON_DIR"), "/32x32.png"));
// macOS menu bar uses a monochrome template from the selected product.
#[cfg(target_os = "macos")]
const TRAY_TEMPLATE_ICON_BYTES: &[u8] =
    include_bytes!(concat!(env!("AGENT_HUB_ICON_DIR"), "/tray-template.png"));

fn parse_bool_setting(value: Option<String>, default: bool) -> bool {
    match value.as_deref().map(str::trim).map(str::to_ascii_lowercase) {
        Some(v) if matches!(v.as_str(), "true" | "1" | "yes" | "on") => true,
        Some(v) if matches!(v.as_str(), "false" | "0" | "no" | "off") => false,
        _ => default,
    }
}

pub(super) fn is_tray_icon_enabled(store: &Arc<core::skill_store::SkillStore>) -> bool {
    let value = store.get_setting("show_tray_icon").ok().flatten();
    parse_bool_setting(value, true)
}

fn request_quit(app: &tauri::AppHandle) {
    let app_for_main = app.clone();
    if let Err(err) = app.run_on_main_thread(move || {
        quit_app(&app_for_main);
    }) {
        log::error!("Failed to schedule quit on main thread: {err}");
        // Fallback: attempt quit anyway.
        quit_app(app);
    }
}

fn load_custom_tray_icon() -> Option<tauri::image::Image<'static>> {
    let img = image::load_from_memory_with_format(CUSTOM_TRAY_ICON_BYTES, image::ImageFormat::Png)
        .ok()?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    Some(tauri::image::Image::new_owned(
        rgba.into_raw(),
        width,
        height,
    ))
}

#[cfg(target_os = "macos")]
fn load_tray_template_icon() -> Option<tauri::image::Image<'static>> {
    let img =
        image::load_from_memory_with_format(TRAY_TEMPLATE_ICON_BYTES, image::ImageFormat::Png)
            .ok()?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    Some(tauri::image::Image::new_owned(
        rgba.into_raw(),
        width,
        height,
    ))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TraySkillGroupStatus {
    Empty,
    Inactive,
    Partial,
    Active,
}

#[derive(Debug, Clone)]
struct TraySkillGroupEntry {
    id: String,
    name: String,
    skill_count: usize,
    synced_pairs: usize,
    total_pairs: usize,
}

impl TraySkillGroupEntry {
    fn status(&self) -> TraySkillGroupStatus {
        if self.total_pairs == 0 {
            TraySkillGroupStatus::Empty
        } else if self.synced_pairs == 0 {
            TraySkillGroupStatus::Inactive
        } else if self.synced_pairs >= self.total_pairs {
            TraySkillGroupStatus::Active
        } else {
            TraySkillGroupStatus::Partial
        }
    }
}

#[derive(Debug, Clone)]
struct TrayMenuData {
    language: TrayLanguage,
    total_skills: usize,
    coding_agent_count: usize,
    update_count: usize,
    skill_groups: Vec<TraySkillGroupEntry>,
    check_updates_running: bool,
}

fn collect_tray_menu_data(store: &core::skill_store::SkillStore) -> TrayMenuData {
    let language = TrayLanguage::from_setting(store.get_setting("language").ok().flatten());
    let all_skills = store.get_all_skills().unwrap_or_default();
    let total_skills = all_skills.len();
    let update_count = all_skills
        .iter()
        .filter(|s| s.update_status == "update_available")
        .count();

    let coding_keys: Vec<String> = core::tool_adapters::enabled_deployable_adapters(store)
        .into_iter()
        .filter(|adapter| matches!(adapter.category, core::tool_adapters::ToolCategory::Coding))
        .map(|adapter| adapter.key)
        .collect();
    let coding_agent_count = coding_keys.len();
    let coding_set: HashSet<&str> = coding_keys.iter().map(String::as_str).collect();

    let synced_pairs_set: HashSet<(String, String)> = store
        .get_all_targets()
        .unwrap_or_default()
        .into_iter()
        .filter(|target| coding_set.contains(target.tool.as_str()))
        .map(|target| (target.skill_id, target.tool))
        .collect();

    let scenarios = store.get_all_scenarios().unwrap_or_default();
    let mut skill_groups = Vec::with_capacity(scenarios.len());
    for scenario in scenarios {
        let skill_ids = store
            .get_skill_ids_for_scenario(&scenario.id)
            .unwrap_or_default();
        let skill_count = skill_ids.len();
        let total_pairs = skill_count * coding_agent_count;
        let mut synced_pairs = 0usize;
        if total_pairs > 0 {
            for sid in &skill_ids {
                for tk in &coding_keys {
                    if synced_pairs_set.contains(&(sid.clone(), tk.clone())) {
                        synced_pairs += 1;
                    }
                }
            }
        }
        skill_groups.push(TraySkillGroupEntry {
            id: scenario.id,
            name: scenario.name,
            skill_count,
            synced_pairs,
            total_pairs,
        });
    }

    TrayMenuData {
        language,
        total_skills,
        coding_agent_count,
        update_count,
        skill_groups,
        check_updates_running: TRAY_CHECK_UPDATES_RUNNING.load(Ordering::SeqCst),
    }
}

fn skill_group_menu_item_id(skill_group: &TraySkillGroupEntry) -> (String, &'static str) {
    // E1 semantics: only a fully-active skill group removes on click. Partial
    // and inactive both fill missing pairs up to fully active.
    match skill_group.status() {
        TraySkillGroupStatus::Active => (
            format!("{TRAY_SKILL_GROUP_REMOVE_PREFIX}{}", skill_group.id),
            "remove",
        ),
        _ => (
            format!("{TRAY_SKILL_GROUP_ADD_PREFIX}{}", skill_group.id),
            "add",
        ),
    }
}

fn skill_group_id_from_menu_id(
    menu_id: &str,
) -> Option<(&str, scenario_service_alias::BatchApplyMode)> {
    if let Some(id) = menu_id.strip_prefix(TRAY_SKILL_GROUP_ADD_PREFIX) {
        return Some((id, scenario_service_alias::BatchApplyMode::Add));
    }
    if let Some(id) = menu_id.strip_prefix(TRAY_SKILL_GROUP_REMOVE_PREFIX) {
        return Some((id, scenario_service_alias::BatchApplyMode::Remove));
    }
    None
}

mod scenario_service_alias {
    pub use crate::core::scenario_service::BatchApplyMode;
}

fn build_tray_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    store: &Arc<core::skill_store::SkillStore>,
) -> tauri::Result<(tauri::menu::Menu<R>, String)> {
    let data = collect_tray_menu_data(store);
    build_tray_menu_from_data(app, &data)
}

fn build_tray_menu_from_data<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    data: &TrayMenuData,
) -> tauri::Result<(tauri::menu::Menu<R>, String)> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

    let menu = Menu::new(app)?;

    let app_name = MenuItem::with_id(app, "tray-app-name", "agent-hub", false, None::<&str>)?;
    menu.append(&app_name)?;

    let status_line = MenuItem::with_id(
        app,
        "tray-status-line",
        format_status_line(data),
        false,
        None::<&str>,
    )?;
    menu.append(&status_line)?;

    if data.update_count > 0 {
        let updates_label = format_updates_label(data.update_count, data.language);
        let updates_item =
            MenuItem::with_id(app, TRAY_OPEN_UPDATES_ID, updates_label, true, None::<&str>)?;
        menu.append(&updates_item)?;
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;

    let skill_groups_label = match data.language {
        TrayLanguage::SimplifiedChinese => "技能组",
        TrayLanguage::TraditionalChinese => "技能組",
        TrayLanguage::English => "Skill Groups",
    };
    let skill_groups_submenu = Submenu::new(app, skill_groups_label, true)?;
    if data.coding_agent_count == 0 {
        let no_agents_label = match data.language {
            TrayLanguage::SimplifiedChinese => "没有已连接的编码 Agent",
            TrayLanguage::TraditionalChinese => "沒有已連接的編碼 Agent",
            TrayLanguage::English => "No coding agents connected",
        };
        let no_agents = MenuItem::with_id(
            app,
            "tray-skill-groups-no-agents",
            no_agents_label,
            false,
            None::<&str>,
        )?;
        skill_groups_submenu.append(&no_agents)?;
    } else {
        let visible: Vec<_> = data
            .skill_groups
            .iter()
            .filter(|p| !matches!(p.status(), TraySkillGroupStatus::Empty))
            .collect();
        if visible.is_empty() {
            let empty_label = match data.language {
                TrayLanguage::SimplifiedChinese => "没有包含技能的技能组",
                TrayLanguage::TraditionalChinese => "沒有包含技能的技能組",
                TrayLanguage::English => "No skill groups with skills",
            };
            let empty = MenuItem::with_id(
                app,
                "tray-skill-groups-empty",
                empty_label,
                false,
                None::<&str>,
            )?;
            skill_groups_submenu.append(&empty)?;
        } else {
            for skill_group in visible {
                let (id, _action) = skill_group_menu_item_id(skill_group);
                let label = skill_group_menu_label(skill_group, data.language);
                let item = MenuItem::with_id(app, id, label, true, None::<&str>)?;
                skill_groups_submenu.append(&item)?;
            }
        }
    }
    menu.append(&skill_groups_submenu)?;

    menu.append(&PredefinedMenuItem::separator(app)?)?;

    let show_label = match data.language {
        TrayLanguage::SimplifiedChinese => "打开 agent-hub",
        TrayLanguage::TraditionalChinese => "開啟 agent-hub",
        TrayLanguage::English => "Open agent-hub",
    };
    let show_item = MenuItem::with_id(app, "show", show_label, true, None::<&str>)?;
    menu.append(&show_item)?;

    let check_label = match (data.language, data.check_updates_running) {
        (TrayLanguage::SimplifiedChinese, true) => "正在检查技能更新...",
        (TrayLanguage::TraditionalChinese, true) => "正在檢查技能更新...",
        (TrayLanguage::English, true) => "Checking for updates...",
        (TrayLanguage::SimplifiedChinese, false) => "检查技能更新",
        (TrayLanguage::TraditionalChinese, false) => "檢查技能更新",
        (TrayLanguage::English, false) => "Check for skill updates",
    };
    let check_item = MenuItem::with_id(
        app,
        TRAY_CHECK_UPDATES_ID,
        check_label,
        !data.check_updates_running,
        None::<&str>,
    )?;
    menu.append(&check_item)?;

    let folder_item = MenuItem::with_id(
        app,
        TRAY_OPEN_FOLDER_ID,
        match data.language {
            TrayLanguage::SimplifiedChinese => "打开技能文件夹",
            TrayLanguage::TraditionalChinese => "開啟技能資料夾",
            TrayLanguage::English => "Open Skills Folder",
        },
        true,
        None::<&str>,
    )?;
    menu.append(&folder_item)?;

    menu.append(&PredefinedMenuItem::separator(app)?)?;

    let quit_label = match data.language {
        TrayLanguage::SimplifiedChinese => "退出",
        TrayLanguage::TraditionalChinese => "退出",
        TrayLanguage::English => "Quit",
    };
    let quit_item = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    menu.append(&quit_item)?;

    Ok((menu, format_tooltip(data)))
}

pub(crate) fn refresh_tray_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    if app.tray_by_id(MAIN_TRAY_ID).is_none() {
        return Ok(());
    }
    let store = app
        .state::<Arc<core::skill_store::SkillStore>>()
        .inner()
        .clone();
    // Collect data off the main thread (DB reads are cheap, no FFI). The
    // actual `Menu::new`, `set_menu`, `set_tooltip` calls hit native macOS
    // (NSMenu / NSStatusItem) APIs and MUST run on the main thread — calling
    // them from a worker thread is UB and crashed the app with a
    // `slice::from_raw_parts` alignment panic during repeated tray actions.
    let data = collect_tray_menu_data(&store);
    let app_for_main = app.clone();
    app.run_on_main_thread(move || {
        let Some(tray) = app_for_main.tray_by_id(MAIN_TRAY_ID) else {
            return;
        };
        match build_tray_menu_from_data(&app_for_main, &data) {
            Ok((menu, tooltip)) => {
                if let Err(err) = tray.set_menu(Some(menu)) {
                    log::warn!("tray set_menu failed: {err}");
                }
                if let Err(err) = tray.set_tooltip(Some(&tooltip)) {
                    log::warn!("tray set_tooltip failed: {err}");
                }
            }
            Err(err) => log::warn!("build_tray_menu_from_data failed: {err}"),
        }
    })
    .map_err(|e| e.to_string())
}

/// Coalesce bursts into at most one tray rebuild per 300 ms window. Avoids
/// rebuilding the menu N times when `SkillGroupBar` loops `skill × agent` calls
/// through `sync_skill_to_tool`. The first request schedules the rebuild;
/// any further requests during the wait window are absorbed.
static TRAY_REFRESH_PENDING: AtomicBool = AtomicBool::new(false);
const TRAY_REFRESH_DEBOUNCE: Duration = Duration::from_millis(300);

pub(crate) fn schedule_tray_refresh(app: &tauri::AppHandle) {
    if TRAY_REFRESH_PENDING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(TRAY_REFRESH_DEBOUNCE).await;
        TRAY_REFRESH_PENDING.store(false, Ordering::SeqCst);
        if let Err(err) = refresh_tray_menu(&app) {
            log::debug!("debounced tray refresh failed: {err}");
        }
    });
}

fn apply_skill_group_from_tray<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    skill_group_id: &str,
    mode: core::scenario_service::BatchApplyMode,
) {
    let store = app
        .state::<Arc<core::skill_store::SkillStore>>()
        .inner()
        .clone();
    let app = app.clone();
    let skill_group_id = skill_group_id.to_string();

    tauri::async_runtime::spawn(async move {
        let store_for_task = store.clone();
        let skill_group_id_for_task = skill_group_id.clone();
        // Result variants:
        //   Ok(true)  — the batch actually ran (do success-side effects)
        //   Ok(false) — skipped because another apply is in-flight or the
        //               skill group/agent set was empty (no real work happened, so
        //               do NOT emit app-files-changed: that would lie to the
        //               frontend about state changes that didn't occur)
        //   Err(_)    — failure inside the batch
        let result = tauri::async_runtime::spawn_blocking(move || -> Result<bool, String> {
            let _guard = match TRAY_SKILL_GROUP_APPLY_LOCK.try_lock() {
                Ok(guard) => guard,
                Err(_) => {
                    log::debug!(
                        "Another skill group apply in flight, ignoring tray click for {skill_group_id_for_task}"
                    );
                    return Ok(false);
                }
            };
            core::scenario_service::ensure_scenario_exists(&store_for_task, &skill_group_id_for_task)
                .map_err(|e| e.to_string())?;
            let skill_ids = store_for_task
                .get_skill_ids_for_scenario(&skill_group_id_for_task)
                .map_err(|e| e.to_string())?;
            if skill_ids.is_empty() {
                return Ok(false);
            }
            let tool_keys: Vec<String> =
                core::tool_adapters::enabled_deployable_adapters(&store_for_task)
                    .into_iter()
                    .filter(|adapter| {
                        matches!(adapter.category, core::tool_adapters::ToolCategory::Coding)
                    })
                    .map(|adapter| adapter.key)
                    .collect();
            if tool_keys.is_empty() {
                return Ok(false);
            }
            core::scenario_service::apply_skills_to_tools(
                &store_for_task,
                &skill_ids,
                &tool_keys,
                mode,
                false,
            )
            .map_err(|e| e.to_string())?;
            Ok(true)
        })
        .await;

        match result {
            Ok(Ok(true)) => {
                if let Err(err) = refresh_tray_menu(&app) {
                    log::warn!("Failed to refresh tray menu after skill group apply: {err}");
                }
                if let Err(err) = app.emit("app-files-changed", ()) {
                    log::warn!(
                        "Failed to emit app-files-changed after tray skill group apply: {err}"
                    );
                }
            }
            Ok(Ok(false)) => {
                // Refresh the menu so the user still sees fresh status (no
                // app-files-changed because nothing actually changed on disk).
                if let Err(err) = refresh_tray_menu(&app) {
                    log::debug!(
                        "Failed to refresh tray menu after skipped skill group apply: {err}"
                    );
                }
            }
            Ok(Err(err)) => {
                log::error!("Tray skill group apply failed for {skill_group_id}: {err}")
            }
            Err(err) => log::error!("Tray skill group apply task panicked: {err}"),
        }
    });
}

fn check_updates_from_tray<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if TRAY_CHECK_UPDATES_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        log::debug!("Skill update check already running, ignoring tray trigger");
        return;
    }
    if let Err(err) = refresh_tray_menu(app) {
        log::warn!("Failed to refresh tray menu before update check: {err}");
    }

    let store = app
        .state::<Arc<core::skill_store::SkillStore>>()
        .inner()
        .clone();
    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        let store_for_task = store.clone();
        // Note: this intentionally does NOT take TRAY_SKILL_GROUP_APPLY_LOCK.
        // Update checks only mutate `update_status` columns; skill group apply
        // mutates `skill_targets`. They're orthogonal, and sharing a lock
        // would silently drop skill group clicks made during a long-running check.
        let result = tauri::async_runtime::spawn_blocking(move || {
            let proxy_url = store_for_task.proxy_url();
            let ids: Vec<String> = store_for_task
                .get_all_skills()
                .map_err(|e| e.to_string())?
                .into_iter()
                .map(|skill| skill.id)
                .collect();
            for skill_id in ids {
                // Yield the lock between checks so a waiting user-initiated
                // operation isn't starved by this loop re-acquiring it
                // immediately (mirrors the auto-updater's FOREGROUND_YIELD).
                std::thread::sleep(std::time::Duration::from_millis(200));
                // Resolve off the lock, then take it only for the status
                // write — the lock must never span a network round-trip (#315).
                let prefetched = commands::skills::prefetch_skill_remote(
                    &store_for_task,
                    &skill_id,
                    true,
                    proxy_url.as_deref(),
                );
                let _repo_lock = match core::repo_lock::RepoLock::acquire("tray check skill update")
                {
                    Ok(lock) => lock,
                    Err(err) => {
                        log::warn!(
                            "Tray update check: failed to acquire repo lock for {skill_id}: {err}"
                        );
                        continue;
                    }
                };
                if let Err(err) = commands::skills::check_skill_update_internal_with_remote(
                    &store_for_task,
                    &skill_id,
                    true,
                    prefetched,
                ) {
                    log::warn!("Tray update check failed for {skill_id}: {err}");
                }
            }
            Ok::<(), String>(())
        })
        .await;

        TRAY_CHECK_UPDATES_RUNNING.store(false, Ordering::SeqCst);

        match result {
            Ok(Ok(())) => {
                // Route through the shared completion helper so the manual
                // tray check writes `auto_update_last_run_at`, emits the same
                // `AutoUpdatePayload { ran_at }` the Settings listener
                // expects, and prevents the background scheduler from firing
                // a redundant round immediately after.
                core::skill_auto_updater::record_round_completion(&app_handle, &store);
            }
            Ok(Err(err)) => {
                log::error!("Tray update check failed: {err}");
                if let Err(err) = refresh_tray_menu(&app_handle) {
                    log::warn!("Failed to refresh tray menu after failed update check: {err}");
                }
            }
            Err(err) => {
                log::error!("Tray update check task panicked: {err}");
                if let Err(err) = refresh_tray_menu(&app_handle) {
                    log::warn!("Failed to refresh tray menu after update check panic: {err}");
                }
            }
        }
    });
}

fn open_skills_folder_from_tray<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let repo_path = core::central_repo::base_dir();

        #[cfg(target_os = "macos")]
        let mut cmd = std::process::Command::new("open");
        #[cfg(target_os = "windows")]
        let mut cmd = {
            let mut c = std::process::Command::new("explorer");
            use std::os::windows::process::CommandExt;
            c.creation_flags(0x08000000);
            c
        };
        #[cfg(target_os = "linux")]
        let mut cmd = std::process::Command::new("xdg-open");

        let status = cmd.arg(&repo_path).status();
        match status {
            Ok(_status) =>
            {
                #[cfg(not(target_os = "windows"))]
                if !_status.success() {
                    log::warn!(
                        "Tray open folder: file manager exited with status: {}",
                        _status
                    );
                }
            }
            Err(err) => log::warn!("Tray open folder failed: {err}"),
        }
        let _ = app_handle;
    });
}

fn open_updates_from_tray(app: &tauri::AppHandle) {
    restore_main_window(app);
    if let Err(err) = app.emit(TRAY_OPEN_UPDATES_EVENT, ()) {
        log::warn!("Failed to emit {TRAY_OPEN_UPDATES_EVENT}: {err}");
    }
}

pub(super) fn ensure_tray_icon(app: &tauri::AppHandle) -> tauri::Result<()> {
    if app.tray_by_id(MAIN_TRAY_ID).is_some() {
        return Ok(());
    }

    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let store = app
        .state::<Arc<core::skill_store::SkillStore>>()
        .inner()
        .clone();
    let (menu, tooltip) = build_tray_menu(app, &store)?;

    let mut builder = TrayIconBuilder::with_id(MAIN_TRAY_ID)
        .tooltip(tooltip)
        .menu(&menu)
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            match id {
                "show" => {
                    log::debug!("Tray menu clicked: show");
                    restore_main_window(app)
                }
                "quit" => {
                    log::debug!("Tray menu clicked: quit");
                    request_quit(app)
                }
                TRAY_OPEN_UPDATES_ID => {
                    log::debug!("Tray menu clicked: open updates");
                    open_updates_from_tray(app);
                }
                TRAY_OPEN_FOLDER_ID => {
                    log::debug!("Tray menu clicked: open skills folder");
                    open_skills_folder_from_tray(app);
                }
                TRAY_CHECK_UPDATES_ID => {
                    log::debug!("Tray menu clicked: check for updates");
                    check_updates_from_tray(app);
                }
                other => {
                    if let Some((skill_group_id, mode)) = skill_group_id_from_menu_id(other) {
                        log::debug!(
                            "Tray menu clicked: skill group {skill_group_id} mode {:?}",
                            mode
                        );
                        apply_skill_group_from_tray(app, skill_group_id, mode);
                    }
                }
            }
        });

    #[cfg(target_os = "macos")]
    let tray_icon = load_tray_template_icon().or_else(load_custom_tray_icon);
    #[cfg(not(target_os = "macos"))]
    let tray_icon = load_custom_tray_icon();

    if let Some(icon) = tray_icon.or_else(|| app.default_window_icon().cloned()) {
        builder = builder.icon(icon);
    }

    #[cfg(target_os = "macos")]
    {
        // Let macOS derive the menu-bar tint from the monochrome alpha mask.
        builder = builder.icon_as_template(true);
    }

    // On macOS, left-click on tray icon opens the menu by default;
    // on Windows/Linux, left-click restores the window directly.
    if !cfg!(target_os = "macos") {
        builder = builder
            .show_menu_on_left_click(false)
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    restore_main_window(tray.app_handle());
                }
            });
    }

    let _tray = builder.build(app)?;
    log::debug!("Tray icon created");
    Ok(())
}

pub fn set_tray_icon_enabled(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let app_for_main = app.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let result = if enabled {
            ensure_tray_icon(&app_for_main).map_err(|e| e.to_string())
        } else {
            let _ = app_for_main.remove_tray_by_id(MAIN_TRAY_ID);
            log::debug!("Tray icon removed");
            Ok(())
        };
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;

    rx.recv()
        .map_err(|e| format!("Failed to receive tray update result: {e}"))?
}
