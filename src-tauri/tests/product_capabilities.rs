//! Each provider can be shipped independently; disabled providers never reach a launcher.
use app_lib::core::task_browser::{Binding, Filters, Provider, TaskClient, TaskFailure};
use serde_json::{json, Value};
use std::{cell::Cell, sync::atomic::AtomicBool};

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
fn compiled_capabilities_control_cli_and_build_info() {
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
