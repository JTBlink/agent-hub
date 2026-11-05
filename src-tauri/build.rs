fn main() {
    product_identity();
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

fn product_identity() {
    for (name, fallback) in [
        ("AGENT_HUB_PRODUCT_ID", "standard"),
        ("AGENT_HUB_PRODUCT_HASH", "development"),
        ("AGENT_HUB_BASE_COMMIT", "unknown"),
    ] {
        println!("cargo:rerun-if-env-changed={name}");
        let value = std::env::var(name).unwrap_or_else(|_| fallback.into());
        assert!(
            !value.chars().any(char::is_control)
                && (name != "AGENT_HUB_PRODUCT_ID"
                    || (!value.is_empty()
                        && value.bytes().all(|byte| byte.is_ascii_lowercase()
                            || byte.is_ascii_digit()
                            || byte == b'-'))),
            "Invalid product build metadata"
        );
        println!("cargo:rustc-env={name}={value}");
    }
    println!("cargo:rerun-if-env-changed=AGENT_HUB_PRODUCT_FEATURES");
    if let Ok(expected) = std::env::var("AGENT_HUB_PRODUCT_FEATURES") {
        let mut expected: Vec<_> = expected.split(',').filter(|v| !v.is_empty()).collect();
        expected.sort_unstable();
        expected.dedup();
        let mut actual = Vec::new();
        for (flag, feature) in [
            ("CARGO_FEATURE_HERDR", "herdr"),
            ("CARGO_FEATURE_STANDARD", "standard"),
        ] {
            if std::env::var_os(flag).is_some() {
                actual.push(feature);
            }
        }
        assert_eq!(
            expected, actual,
            "Product configuration and Cargo features differ"
        );
    }
}
