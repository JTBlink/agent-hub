//! Product feature checks exercise the shipped CLI and public catalog.
use app_lib::core::task_browser::{Binding, Filters, Provider, TaskClient, TaskFailure};
use serde_json::{json, Value};
use std::{cell::Cell, process::Command, sync::atomic::AtomicBool};

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

#[test]
fn provider_selection_precedes_any_identity_or_platform_request() {
    for provider in [Provider::Github, Provider::Gitlab] {
        let calls = Cell::new(0);
        let reader =
            |binding: &Binding, args: &[String], _: &AtomicBool| -> Result<Value, TaskFailure> {
                calls.set(calls.get() + 1);
                let endpoint = args.last().unwrap();
                if endpoint == "user" {
                    return Ok(json!({"login":"demo", "username":"demo"}));
                }
                if binding.provider == Provider::Github {
                    assert!(endpoint.starts_with("search/issues?"));
                    Ok(json!({"items":[], "total_count":0}))
                } else {
                    assert!(endpoint.starts_with("projects/team%2Fdemo/issues?"));
                    Ok(json!([]))
                }
            };
        let binding = Binding {
            id: "00000000-0000-4000-8000-000000000007".into(),
            project_id: "demo".into(),
            provider,
            host: "git.example.invalid".into(),
            repository: "team/demo".into(),
            launcher: None,
        };
        let result =
            TaskClient::new(reader).list(&binding, &Filters::default(), 1, &AtomicBool::new(false));
        if provider.enabled() {
            assert!(result.unwrap().items.is_empty());
            assert_eq!(calls.get(), 2);
        } else {
            assert!(result.is_err());
            assert_eq!(calls.get(), 0);
        }
    }
}

#[test]
fn compiled_features_control_cli_and_build_info() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_agent-hub-cli"))
        .arg("--help")
        .output()
        .unwrap();
    assert!(output.status.success());
    let help = String::from_utf8(output.stdout).unwrap();
    assert_eq!(
        help.lines()
            .any(|line| line.trim_start().starts_with("git ")),
        cfg!(feature = "cloud-sync")
    );
    let features = app_lib::product::current().features;
    for (name, included) in [
        ("cloud-sync", cfg!(feature = "cloud-sync")),
        ("github", cfg!(feature = "github")),
        ("gitlab", cfg!(feature = "gitlab")),
    ] {
        assert_eq!(features.contains(&name), included);
    }
}

#[test]
fn excluded_bindings_stay_persisted_for_later_product_builds() {
    let temp = tempfile::tempdir().unwrap();
    let store = app_lib::core::skill_store::SkillStore::new(&temp.path().join("store.db")).unwrap();
    let values = json!([{"id":"00000000-0000-4000-8000-000000000007", "project_id":"demo", "provider":"github", "host":"git.example.invalid", "repository":"team/demo", "launcher":null}]);
    let raw = values.to_string();
    store.set_setting("task_browser_bindings_v1", &raw).unwrap();
    let visible = app_lib::core::task_browser::bindings(&store).unwrap();
    assert_eq!(visible.len(), usize::from(cfg!(feature = "github")));
    assert_eq!(
        store
            .get_setting("task_browser_bindings_v1")
            .unwrap()
            .unwrap(),
        raw
    );
}
