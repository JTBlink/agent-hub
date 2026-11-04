fn main() {
    // Use a custom Windows application manifest that opts the process into long
    // path support (#298/#299). app_manifest() replaces Tauri's default, so the
    // manifest file re-declares the Common-Controls v6 dependency Tauri ships.
    // On non-Windows targets the manifest is simply ignored.
    tauri_build::try_build(
        tauri_build::Attributes::new().windows_attributes(
            tauri_build::WindowsAttributes::new()
                .app_manifest(include_str!("windows-app-manifest.xml")),
        ),
    )
    .expect("failed to run tauri-build");

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        // Tauri embeds its resource only in binaries. Real WebView integration tests
        // also import Common Controls v6 APIs and must use the same manifest.
        let resource =
            std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("resource.rc");
        embed_resource::compile_for_tests(resource, embed_resource::NONE)
            .manifest_required()
            .expect("failed to embed Windows resources in integration tests");
    }
}
