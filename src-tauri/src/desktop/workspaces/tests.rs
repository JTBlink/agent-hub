use super::*;
use tauri::{LogicalPosition, LogicalSize, WebviewBuilder, WindowBuilder};
#[test]
fn only_backend_registered_workspaces_have_application_access() {
    let app = tauri::test::mock_builder()
        .manage(WorkspaceWindows::default())
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let window = WindowBuilder::new(&app, "main").build().unwrap();
    let view = |label| {
        window
            .add_child(
                WebviewBuilder::new(label, Default::default()),
                LogicalPosition::new(0, 0),
                LogicalSize::new(800, 600),
            )
            .unwrap()
    };
    let main = view("main");
    let trusted = view("workspace-registered");
    let unregistered = view("workspace-other");
    let preview = view("preview-native-page");
    app.state::<WorkspaceWindows>()
        .labels
        .lock()
        .unwrap()
        .insert(trusted.label().into());
    assert!(is_workspace(&main));
    assert!(is_workspace(&trusted));
    assert!(!is_workspace(&unregistered));
    assert!(!is_workspace(&preview));
    app.state::<WorkspaceWindows>().remove(trusted.label());
    assert!(!is_workspace(&trusted));
}

#[test]
fn bundled_and_development_routes_keep_the_application_origin() {
    for origin in [
        "tauri://localhost",
        "http://127.0.0.1:1420",
        "http://tauri.localhost",
    ] {
        let application = tauri::Url::parse(origin).unwrap();
        let route = application
            .join("/project/demo?worktree=%2Fworkspace%2Ftask")
            .unwrap();
        assert!(same_application_origin(&application, &route));
    }
    assert!(!same_application_origin(
        &"http://127.0.0.1:1420".parse().unwrap(),
        &"http://127.0.0.1:1421".parse().unwrap()
    ));
}
