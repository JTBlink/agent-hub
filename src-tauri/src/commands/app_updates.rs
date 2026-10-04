//! Application updates link to the agent-hub release page.

#[derive(serde::Serialize)]
pub struct AppUpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
}

fn release_info(current_version: String) -> AppUpdateInfo {
    AppUpdateInfo {
        has_update: false,
        latest_version: current_version.clone(),
        current_version,
        release_url: "https://github.com/JTBlink/agent-hub/releases".into(),
    }
}

/// Keep the existing notification contract without checking an unrelated release feed.
#[tauri::command]
pub fn check_app_update(app: tauri::AppHandle) -> AppUpdateInfo {
    release_info(app.config().version.clone().unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manual_updates_do_not_offer_an_automatic_install() {
        let info = release_info("1.40.3".into());
        assert!(!info.has_update);
        assert_eq!(info.latest_version, info.current_version);
        assert!(info.release_url.ends_with("/agent-hub/releases"));
    }
}
