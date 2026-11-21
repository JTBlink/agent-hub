#![cfg(all(feature = "github", feature = "gitlab"))]

use app_lib::core::task_browser::{Binding, Provider, RunnerAction, TaskClient, TaskFailure};
use serde_json::json;
use std::sync::atomic::AtomicBool;

#[test]
fn reads_repository_runners_and_keeps_platform_specific_states() {
    let client = TaskClient::new(|binding: &Binding, args: &[String], _: &AtomicBool| {
        if args[5] == "graphql" {
            assert_eq!(binding.provider, Provider::Gitlab);
            assert_eq!(&args[..3], ["api", "--method", "POST"]);
            if args.iter().any(|arg| arg.contains("jobs(first: 1)")) {
                assert!(args.iter().any(|arg| arg.contains("Ci::Runner/128")));
                return Ok(
                    json!({"data": {"runner": {"jobs": {"count": 11}, "userPermissions": {"updateRunner": true, "deleteRunner": false}}}}),
                );
            }
            if args
                .iter()
                .any(|arg| arg.contains("assignableToProjectPath"))
            {
                return Ok(json!({"data": {"currentUser": {"runners": {
                    "nodes": [{"id": "gid://gitlab/Ci::Runner/135", "description": "spare", "status": "ONLINE"}],
                    "pageInfo": {"hasNextPage": false}
                }}}}));
            }
            assert!(args.iter().any(|arg| arg.contains("nodes { id shortSha")));
            return Ok(json!({"data": {"project": {"runners": {
                "nodes": [
                    {"id": "gid://gitlab/Ci::Runner/128", "shortSha": "demo1234",
                     "tagList": ["linux-ci"], "contactedAt": "2026-11-02T08:00:00Z",
                     "createdAt": "2026-11-01T08:00:00Z", "createdBy": {"name": "Demo Creator"},
                     "locked": true, "projectCount": 3, "ownerProject": {"fullPath": "team/repo"},
                     "managers": {"nodes": [{"platformName": "linux", "version": "18.0.0", "ipAddress": "192.0.2.1"}]}},
                    {"id": "gid://gitlab/Ci::Runner/129", "shortSha": "invalid-length"}
                ],
                "pageInfo": {"hasNextPage": false}
            }}}}));
        }
        assert_eq!(&args[..3], ["api", "--method", "GET"]);
        if args[5] == "projects/team%2Frepo" {
            return Ok(json!({"id": 42, "permissions": {"project_access": {"access_level": 50}}}));
        }
        if args[5] == "runners/128" {
            return Ok(json!({"id": 128, "status": "stale"}));
        }
        let value = match binding.provider {
            Provider::Github => {
                assert!(args[5].starts_with("repos/team/repo/actions/runners?"));
                json!({"total_count": 1, "runners": [{
                    "id": 128, "name": "mac", "os": "macos", "status": "online",
                    "busy": true, "labels": [{"name": "self-hosted"}]
                }]})
            }
            Provider::Gitlab => {
                assert!(args[5].starts_with("projects/team%2Frepo/runners?"));
                json!([
                    { "id": 128, "description": "build", "status": "stale",
                      "online": false, "paused": true, "runner_type": "group_type", "job_execution_status": "idle" },
                    { "id": 129, "status": "never_contacted", "online": false },
                    { "id": 130, "status": null, "job_execution_status": "active" },
                    { "id": 131, "status": "initializing", "online": false, "job_execution_status": "draining" }
                ])
            }
        };
        Ok::<_, TaskFailure>(value)
    });
    let mut binding = Binding {
        id: "00000000-0000-0000-0000-000000000001".into(),
        project_id: "demo".into(),
        provider: Provider::Github,
        host: "github.com".into(),
        repository: "team/repo".into(),
        launcher: None,
    };
    let cancel = AtomicBool::new(false);
    let github = client.runners(&binding, &cancel).unwrap();
    assert_eq!(github.items[0].busy, Some(true));
    assert_eq!(
        github.items[0].labels.as_deref(),
        Some(&["self-hosted".to_owned()][..])
    );
    assert_eq!(github.items[0].contacted_at, None);

    binding.provider = Provider::Gitlab;
    binding.host = "gitlab.example.invalid".into();
    let gitlab = client.runners(&binding, &cancel).unwrap();
    assert_eq!(gitlab.items[0].id, github.items[0].id);
    assert_eq!(gitlab.items[0].paused, Some(true));
    assert_eq!(gitlab.items[0].state, "stale");
    assert_eq!(gitlab.items[0].short_id.as_deref(), Some("demo1234"));
    assert_eq!(gitlab.items[1].short_id, None);
    assert_eq!(gitlab.items[1].state, "never_contacted");
    assert_eq!(gitlab.items[2].state, "unknown");
    assert_eq!(gitlab.items[3].state, "initializing");
    let runner = &gitlab.items[0];
    assert_eq!(runner.busy, Some(false));
    assert_eq!(runner.os.as_deref(), Some("Linux"));
    assert_eq!(runner.labels.as_deref(), Some(&["linux-ci".to_owned()][..]));
    assert_eq!(runner.contacted_at.as_deref(), Some("2026-11-02T08:00:00Z"));
    assert_eq!(runner.created_by.as_deref(), Some("Demo Creator"));
    assert_eq!(runner.created_at.as_deref(), Some("2026-11-01T08:00:00Z"));
    assert_eq!(runner.version.as_deref(), Some("18.0.0"));
    assert_eq!(runner.manager_address.as_deref(), Some("192.0.2.1"));
    assert_eq!(runner.owner_project.as_deref(), Some("team/repo"));
    assert_eq!(runner.project_count, Some(3));
    assert_eq!(runner.locked, Some(true));
    assert_eq!(gitlab.items[2].busy, Some(true));
    assert_eq!(gitlab.items[3].job_status.as_deref(), Some("draining"));
    assert_eq!(gitlab.assignable.as_ref().unwrap()[0].id, 135);
    assert!(gitlab.can_create_runner);
    let details = client.runner_details(&binding, 128, &cancel).unwrap();
    assert_eq!(details.job_count, Some(11));
    assert!(details.can_update);
    assert!(!details.can_delete);
}

#[test]
fn runner_mutations_require_current_project_membership_and_action_permission() {
    let allow_delete = std::cell::Cell::new(false);
    let requests = std::cell::RefCell::new(Vec::new());
    let client = TaskClient::new(|_: &Binding, args: &[String], _: &AtomicBool| {
        requests
            .borrow_mut()
            .push((args[2].clone(), args[5].clone()));
        Ok::<_, TaskFailure>(match args[2].as_str() {
            "GET" => json!([{"id": 128}]),
            "POST" => {
                assert_eq!(args[5], "graphql");
                json!({"data": {"runner": {"userPermissions": {
                    "updateRunner": true,
                    "deleteRunner": allow_delete.get()
                }}}})
            }
            "PUT" => {
                assert_eq!(args[5], "runners/128");
                assert!(args.contains(&"paused=true".to_owned()));
                json!({"id": 128, "paused": true})
            }
            "DELETE" => {
                assert_eq!(args[5], "runners/128");
                serde_json::Value::Null
            }
            _ => panic!("unexpected provider request"),
        })
    });
    let binding = Binding {
        id: "00000000-0000-0000-0000-000000000001".into(),
        project_id: "demo".into(),
        provider: Provider::Gitlab,
        host: "gitlab.example.invalid".into(),
        repository: "team/repo".into(),
        launcher: None,
    };
    let cancel = AtomicBool::new(false);
    assert_eq!(
        client
            .manage_runner(&binding, 129, RunnerAction::Pause, &cancel)
            .unwrap_err()
            .kind,
        "permission"
    );
    assert_eq!(
        client
            .manage_runner(&binding, 128, RunnerAction::Delete, &cancel)
            .unwrap_err()
            .kind,
        "permission"
    );
    assert!(!requests
        .borrow()
        .iter()
        .any(|(method, _)| method == "PUT" || method == "DELETE"));
    client
        .manage_runner(&binding, 128, RunnerAction::Pause, &cancel)
        .unwrap();
    allow_delete.set(true);
    client
        .manage_runner(&binding, 128, RunnerAction::Delete, &cancel)
        .unwrap();
    assert_eq!(
        requests
            .borrow()
            .iter()
            .filter(|(method, _)| method == "DELETE")
            .count(),
        1
    );
}

#[test]
fn creates_a_runner_in_the_resolved_project_and_returns_its_one_time_token() {
    let client =
        TaskClient::new(
            |_: &Binding, args: &[String], _: &AtomicBool| match args[2].as_str() {
                "GET" => {
                    assert_eq!(args[5], "projects/team%2Frepo");
                    Ok::<_, TaskFailure>(
                        json!({"id": 42, "permissions": {"group_access": {"access_level": 50}}}),
                    )
                }
                "POST" => {
                    assert_eq!(args[5], "user/runners");
                    assert!(args.contains(&"project_id=42".to_owned()));
                    assert!(args.contains(&"runner_type=project_type".to_owned()));
                    assert!(args.contains(&"description=Demo Runner".to_owned()));
                    Ok(json!({"id": 501, "token": "synthetic-example-value"}))
                }
                _ => panic!("unexpected provider request"),
            },
        );
    let binding = Binding {
        id: "00000000-0000-0000-0000-000000000001".into(),
        project_id: "demo".into(),
        provider: Provider::Gitlab,
        host: "gitlab.example.invalid".into(),
        repository: "team/repo".into(),
        launcher: None,
    };
    let created = client
        .create_project_runner(&binding, " Demo Runner ", &AtomicBool::new(false))
        .unwrap();
    assert_eq!(created.id, 501);
    assert!(created.token == "synthetic-example-value");
}
