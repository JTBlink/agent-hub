#[path = "build/default_content.rs"]
mod default_content;

fn main() {
    product_identity();
    default_content::prepare();
    println!("cargo:rustc-check-cfg=cfg(agent_hub_desktop_plugin)");
    println!("cargo:rerun-if-env-changed=AGENT_HUB_DESKTOP_PLUGIN");
    if std::env::var("AGENT_HUB_DESKTOP_PLUGIN").as_deref() == Ok("1") {
        println!("cargo:rustc-cfg=agent_hub_desktop_plugin");
    }
    println!("cargo:rerun-if-env-changed=AGENT_HUB_ICON_DIR");
    let icons = std::env::var_os("AGENT_HUB_ICON_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from("icons"));
    let icons = icons
        .canonicalize()
        .expect("product icon directory is required");
    for file in ["32x32.png", "tray-template.png"] {
        println!("cargo:rerun-if-changed={}", icons.join(file).display());
    }
    println!("cargo:rustc-env=AGENT_HUB_ICON_DIR={}", icons.display());
    // Link our manifest separately into every target below. Tauri's binary-only
    // resource keeps the version and icons, without a duplicate RT_MANIFEST.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest()),
    )
    .expect("failed to run tauri-build");

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        // `compile_for_tests` excludes the library unit-test harness. Every target
        // that links Tauri needs Common Controls v6 before its entry point runs.
        println!("cargo:rerun-if-changed=windows-app-manifest.xml");
        println!("cargo:rerun-if-changed=windows-manifest.rc");
        embed_resource::compile_for_everything("windows-manifest.rc", embed_resource::NONE)
            .manifest_required()
            .expect("failed to embed Windows manifest in application and test targets");
    }
}

fn product_identity() {
    println!("cargo:rerun-if-env-changed=AGENT_HUB_PRODUCT_VERSION");
    let version = std::env::var("AGENT_HUB_PRODUCT_VERSION")
        .unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_owned());
    assert!(
        !version.is_empty() && !version.chars().any(char::is_control),
        "Invalid product version"
    );
    println!("cargo:rustc-env=AGENT_HUB_PRODUCT_VERSION={version}");
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
    println!("cargo:rerun-if-env-changed=AGENT_HUB_DATA_ID");
    let data_id = std::env::var("AGENT_HUB_DATA_ID")
        .or_else(|_| std::env::var("AGENT_HUB_PRODUCT_ID"))
        .unwrap_or_else(|_| "standard".into());
    assert!(
        data_id
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_lowercase)
            && data_id
                .bytes()
                .all(|byte| { byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' }),
        "Invalid product data ID"
    );
    println!("cargo:rustc-env=AGENT_HUB_DATA_ID={data_id}");
    println!("cargo:rerun-if-env-changed=AGENT_HUB_PRODUCT_CLI_NAME");
    let cli_name =
        std::env::var("AGENT_HUB_PRODUCT_CLI_NAME").unwrap_or_else(|_| "agent-hub-cli".into());
    assert!(
        cli_name.strip_suffix("-cli").is_some_and(|prefix| {
            prefix
                .as_bytes()
                .first()
                .is_some_and(u8::is_ascii_lowercase)
                && prefix
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        }),
        "Invalid product CLI name"
    );
    println!("cargo:rustc-env=AGENT_HUB_PRODUCT_CLI_NAME={cli_name}");
    println!("cargo:rerun-if-changed=../products/features.json");
    let feature_catalog: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string("../products/features.json").expect("feature catalog is required"),
    )
    .expect("invalid feature catalog");
    let mut actual: Vec<String> = feature_catalog["features"]
        .as_object()
        .expect("features must be an object")
        .keys()
        .chain(std::iter::once(&"standard".to_owned()))
        .filter(|feature| {
            let flag = format!(
                "CARGO_FEATURE_{}",
                feature.replace('-', "_").to_ascii_uppercase()
            );
            std::env::var_os(flag).is_some()
        })
        .cloned()
        .collect();
    actual.sort_unstable();
    let generated =
        std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("features.rs");
    std::fs::write(
        generated,
        format!("const COMPILED_FEATURES: &[&str] = &{actual:?};"),
    )
    .expect("write compiled feature catalog");
    println!("cargo:rerun-if-env-changed=AGENT_HUB_PRODUCT_FEATURES");
    if let Ok(expected) = std::env::var("AGENT_HUB_PRODUCT_FEATURES") {
        let mut expected: Vec<_> = expected.split(',').filter(|v| !v.is_empty()).collect();
        expected.sort_unstable();
        expected.dedup();
        assert_eq!(
            expected, actual,
            "Product configuration and Cargo features differ"
        );
    }
}
