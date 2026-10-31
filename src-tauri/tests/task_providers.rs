use app_lib::core::task_browser::{
    Binding, CliLauncher, Filters, Provider, TaskClient, TaskFailure,
};
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;

#[test]
fn both_platforms_keep_host_repository_identity_and_pagination() {
    let read = |binding: &Binding, args: &[String], _: &AtomicBool| -> Result<Value, TaskFailure> {
        let endpoint = &args[args.len() - 1];
        if endpoint == "user" {
            return Ok(json!({"login":"demo","username":"demo"}));
        }
        if binding.provider == Provider::Github {
            Ok(
                json!({"total_count":26,"incomplete_results":false,"items":[{"number":7,"title":"Example","state":"open","html_url":"https://github.example.invalid/team/demo/issues/7","updated_at":"2026-01-01T00:00:00Z","assignees":[]}]}),
            )
        } else {
            Ok(
                json!([{"iid":7,"title":"Example","state":"opened","web_url":"https://gitlab.example.invalid/group/team/demo/-/issues/7","updated_at":"2026-01-01T00:00:00Z","assignees":[]}]),
            )
        }
    };
    let client = TaskClient::new(read);
    let mut binding = Binding {
        id: "00000000-0000-4000-8000-000000000001".into(),
        project_id: "demo".into(),
        provider: Provider::Github,
        host: "github.example.invalid".into(),
        repository: "team/demo".into(),
        launcher: Some(CliLauncher {
            program: "missing-wrapper".into(),
            args: vec![],
        }),
    };
    let cancel = AtomicBool::new(false);
    let github = client
        .list(&binding, &Filters::default(), 1, &cancel)
        .unwrap();
    assert!(github.has_more);
    assert_eq!(github.identity, "demo");
    assert_eq!(github.items[0].number, 7);
    binding.provider = Provider::Gitlab;
    binding.host = "gitlab.example.invalid".into();
    binding.repository = "group/team/demo".into();
    let gitlab = client
        .list(&binding, &Filters::default(), 1, &cancel)
        .unwrap();
    assert!(!gitlab.has_more);
    assert_ne!(github.items[0].key, gitlab.items[0].key);
    assert_eq!(gitlab.items[0].repository, "group/team/demo");
    assert_eq!(gitlab.items[0].state, "opened");
}

#[test]
fn declared_launcher_is_required_and_cancellation_stops_reads() {
    use app_lib::core::task_browser::SystemCli;
    use std::sync::atomic::Ordering;
    let directory = tempfile::tempdir().unwrap();
    let binding = Binding {
        id: "00000000-0000-4000-8000-000000000002".into(),
        project_id: "demo".into(),
        provider: Provider::Gitlab,
        host: "gitlab.example.invalid".into(),
        repository: "group/team/demo".into(),
        launcher: Some(CliLauncher {
            program: directory
                .path()
                .join("missing-wrapper")
                .to_string_lossy()
                .into(),
            args: vec![],
        }),
    };
    let client = TaskClient::new(SystemCli {
        cwd: directory.path().into(),
    });
    let cancel = AtomicBool::new(false);
    assert_eq!(
        client
            .list(&binding, &Filters::default(), 1, &cancel)
            .unwrap_err()
            .kind,
        "missing_cli"
    );
    cancel.store(true, Ordering::Release);
    assert_eq!(
        client
            .list(&binding, &Filters::default(), 1, &cancel)
            .unwrap_err()
            .kind,
        "cancelled"
    );
}
