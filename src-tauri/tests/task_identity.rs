#![cfg(any(feature = "github", feature = "gitlab"))]
use app_lib::core::task_browser::{Binding, Provider, TaskClient, TaskFailure};
use serde_json::{json, Value};
use std::sync::{atomic::AtomicBool, Mutex};

fn identity_reads_only_user(provider: Provider, expected: &str) {
    let endpoints = Mutex::new(Vec::new());
    let reader = |_: &Binding, args: &[String], _: &AtomicBool| -> Result<Value, TaskFailure> {
        endpoints.lock().unwrap().push(args.last().unwrap().clone());
        Ok(json!({"login":"github-account","username":"gitlab-account","token":"never-return"}))
    };
    let binding = Binding {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: "demo".into(),
        provider,
        host: "git.example.invalid".into(),
        repository: "team/demo".into(),
        launcher: None,
    };
    let client = TaskClient::new(reader);
    assert_eq!(
        client.identity(&binding, &AtomicBool::new(false)).unwrap(),
        expected
    );
    assert_eq!(*endpoints.lock().unwrap(), ["user"]);
    assert_eq!(
        client
            .identity(&binding, &AtomicBool::new(true))
            .unwrap_err()
            .kind,
        "cancelled"
    );
    assert_eq!(endpoints.lock().unwrap().len(), 1);
}

#[cfg(feature = "github")]
#[test]
fn github_owns_login_parsing_without_loading_repository_tasks() {
    identity_reads_only_user(Provider::Github, "github-account");
}

#[cfg(feature = "gitlab")]
#[test]
fn gitlab_owns_login_parsing_without_loading_repository_tasks() {
    identity_reads_only_user(Provider::Gitlab, "gitlab-account");
}
