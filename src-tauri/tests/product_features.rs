//! Product capability checks exercise the shipped CLI and public catalog.
use std::process::Command;

#[test]
fn launch_help_only_exposes_compiled_backends() {
    let output = Command::new(env!("CARGO_BIN_EXE_agent-hub-cli"))
        .args(["tools", "launch", "--help"])
        .output()
        .unwrap();
    assert!(output.status.success());
    let help = String::from_utf8(output.stdout).unwrap();
    let has_start = help
        .lines()
        .any(|line| line.trim_start().starts_with("start "));
    assert_eq!(has_start, cfg!(feature = "herdr"), "{help}");
    assert!(
        help.contains("terminal"),
        "native Agent launch remains available"
    );
}

#[test]
fn automation_catalog_only_embeds_selected_integrations() {
    let catalog = app_lib::core::automation::templates(Some("en"));
    let includes_herdr = catalog.agent_starter.as_ref().is_some_and(|draft| {
        draft
            .files
            .iter()
            .any(|file| file.path == "scripts/herdr_agent.py" || file.path == "config/herdr.json")
    });
    assert_eq!(includes_herdr, cfg!(feature = "herdr"));
    assert!(catalog
        .templates
        .iter()
        .any(|template| template.id == "disk-cleanup"));
    assert_eq!(
        app_lib::core::automation::template("agent-code-review", Some("en")).is_some(),
        cfg!(feature = "herdr")
    );
}

#[test]
fn build_info_describes_actual_compilation_without_opening_user_data() {
    let directory = tempfile::tempdir().unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_agent-hub-cli"))
        .env("AGENT_HUB_PRODUCT_ID", "runtime-override")
        .env("AGENT_HUB_PRODUCT_HASH", "runtime-override")
        .args(["--json", "--skills-root"])
        .arg(directory.path())
        .arg("build-info")
        .output()
        .unwrap();
    assert!(output.status.success());
    let info: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(info["product_id"], app_lib::product::current().product_id);
    assert_eq!(info["config_hash"], app_lib::product::current().config_hash);
    assert_eq!(
        info["features"]
            .as_array()
            .unwrap()
            .iter()
            .any(|value| value == "herdr"),
        cfg!(feature = "herdr")
    );
    assert!(std::fs::read_dir(directory.path())
        .unwrap()
        .next()
        .is_none());
}

#[test]
fn supported_product_identity_preserves_standard_and_isolates_personal() {
    let product = app_lib::product::current();
    let profile = std::path::Path::new("profile");
    // These are product contracts, independent of feature set and build digest.
    let (application_id, home) = match product.product_id {
        "standard" => ("com.jtstudio.agenthub", "profile/.agent-hub"),
        "personal" => (
            "com.jtstudio.agenthub.personal",
            "profile/.agent-hub-personal",
        ),
        _ => return, // Other independently defined products have their own contracts.
    };
    assert_eq!(app_lib::product::application_id(), application_id);
    assert_eq!(
        app_lib::product::home_directory(profile),
        std::path::Path::new(home)
    );
    if product.product_id != "standard" {
        let error = app_lib::core::app_updates::check_update("0.0.0", None).unwrap_err();
        assert_eq!(error.message, "APP_UPDATE_NO_RELEASE");
    }
}

#[test]
#[cfg(not(feature = "herdr"))]
fn native_agent_environment_does_not_probe_excluded_backend() {
    let directory = tempfile::tempdir().unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_agent-hub-cli"))
        .args(["--json", "--skills-root"])
        .arg(directory.path())
        .args(["tools", "launch", "environment"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let info: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(info["herdr_path"], serde_json::Value::Null);
}
