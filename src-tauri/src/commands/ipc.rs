//! Application commands belong to the trusted workspace, never previewed pages.
pub fn main_only<R: tauri::Runtime>(
    handler: impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static,
) -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    move |invoke| {
        if invoke.message.webview_ref().label() != "main" {
            invoke
                .resolver
                .reject("Application commands are unavailable to preview pages");
            return true;
        }
        handler(invoke)
    }
}
