//! A native preview adds another WebView to the existing desktop window.
use std::sync::Arc;
use tauri::{LogicalPosition, LogicalSize, WebviewBuilder, WindowBuilder};
struct View(tauri::Webview<tauri::test::MockRuntime>);
impl AsRef<tauri::Webview<tauri::test::MockRuntime>> for View {
    fn as_ref(&self) -> &tauri::Webview<tauri::test::MockRuntime> {
        &self.0
    }
}
#[test]
fn terminal_ipc_survives_a_native_child_view_and_preview_pages_cannot_use_it() {
    let app = tauri::test::mock_builder()
        .manage(Arc::new(app_lib::core::terminal::TerminalManager::default()))
        .invoke_handler(app_lib::commands::ipc::main_only(tauri::generate_handler![
            app_lib::commands::terminal::terminal_list
        ]))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let window = WindowBuilder::new(&app, "main").build().unwrap();
    let root = window
        .add_child(
            WebviewBuilder::new("main", Default::default()),
            LogicalPosition::new(0, 0),
            LogicalSize::new(1000, 700),
        )
        .unwrap();
    let child = window
        .add_child(
            WebviewBuilder::new("preview-native-test", Default::default()),
            LogicalPosition::new(100, 100),
            LogicalSize::new(500, 400),
        )
        .unwrap();
    let request = || tauri::webview::InvokeRequest {
        cmd: "terminal_list".into(),
        callback: tauri::ipc::CallbackFn(0),
        error: tauri::ipc::CallbackFn(1),
        url: "http://tauri.localhost".parse().unwrap(),
        body: Default::default(),
        headers: Default::default(),
        invoke_key: tauri::test::INVOKE_KEY.to_string(),
    };
    let result = tauri::test::get_ipc_response(&View(root), request())
        .unwrap()
        .deserialize::<serde_json::Value>()
        .unwrap();
    assert_eq!(result, serde_json::json!([]));
    let denied = tauri::test::get_ipc_response(&View(child), request()).unwrap_err();
    assert_eq!(
        denied,
        "Application commands are unavailable to preview pages"
    );
}
