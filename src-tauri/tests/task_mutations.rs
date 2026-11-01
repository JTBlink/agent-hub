use app_lib::core::task_browser::{
    Binding, IssueAction, IssueStateChange, Provider, TaskClient, TaskFailure, TaskKind,
};
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;

fn binding(provider: Provider) -> Binding {
    Binding {
        id: "00000000-0000-4000-8000-000000000007".into(),
        project_id: "demo".into(),
        provider,
        host: "git.example.invalid".into(),
        repository: "team/demo".into(),
        launcher: None,
    }
}
fn field<'a>(args: &'a [String], key: &str) -> &'a str {
    args.iter()
        .find_map(|arg| arg.strip_prefix(&format!("{key}=")))
        .unwrap()
}

#[test]
fn issue_state_writes_use_the_bound_repository_and_provider_semantics() {
    for provider in [Provider::Github, Provider::Gitlab] {
        let actions = if provider == Provider::Github {
            vec![
                IssueAction::Open,
                IssueAction::Completed,
                IssueAction::NotPlanned,
            ]
        } else {
            vec![IssueAction::Open, IssueAction::Closed]
        };
        for action in actions {
            let reader = |bound: &Binding,
                          args: &[String],
                          _: &AtomicBool|
             -> Result<Value, TaskFailure> {
                assert_eq!(bound.repository, "team/demo");
                assert!(args.iter().any(|arg| arg == &bound.host));
                let endpoint = &args[5];
                assert_eq!(
                    endpoint,
                    if provider == Provider::Github {
                        "repos/team/demo/issues/7"
                    } else {
                        "projects/team%2Fdemo/issues/7"
                    }
                );
                if args[2] == "GET" {
                    return Ok(json!({"number":7,"iid":7,"state":"open"}));
                }
                let open = matches!(action, IssueAction::Open);
                if provider == Provider::Github {
                    assert_eq!(args[2], "PATCH");
                    assert_eq!(field(args, "state"), if open { "open" } else { "closed" });
                    if !open {
                        assert_eq!(
                            field(args, "state_reason"),
                            if matches!(action, IssueAction::NotPlanned) {
                                "not_planned"
                            } else {
                                "completed"
                            }
                        );
                    }
                } else {
                    assert_eq!(args[2], "PUT");
                    assert_eq!(
                        field(args, "state_event"),
                        if open { "reopen" } else { "close" }
                    );
                }
                Ok(
                    json!({"number":7,"iid":7,"state":if open { "open" } else { "closed" },"state_reason":if matches!(action, IssueAction::NotPlanned) { "not_planned" } else { "completed" }}),
                )
            };
            let updated = TaskClient::new(reader)
                .update_issue(
                    &binding(provider),
                    7,
                    &IssueStateChange {
                        action,
                        duplicate_of: None,
                    },
                )
                .unwrap();
            assert_eq!(updated.number, 7);
            assert_eq!(
                updated.state,
                if matches!(action, IssueAction::Open) {
                    "open"
                } else {
                    "closed"
                }
            );
        }
    }
}

#[test]
fn duplicate_close_resolves_both_issue_identities_and_rejects_graphql_errors() {
    for reject in [false, true] {
        let reader = |_: &Binding, args: &[String], _: &AtomicBool| -> Result<Value, TaskFailure> {
            match args[5].as_str() {
                "repos/team/demo/issues/7" => {
                    Ok(json!({"number":7,"state":"open","node_id":"ISSUE_7"}))
                }
                "repos/team/demo/issues/8" => {
                    Ok(json!({"number":8,"state":"open","node_id":"ISSUE_8"}))
                }
                "graphql" => {
                    assert_eq!(args[2], "POST");
                    assert_eq!(field(args, "id"), "ISSUE_7");
                    assert_eq!(field(args, "target"), "ISSUE_8");
                    assert!(field(args, "query")
                        .contains("stateReason:DUPLICATE,duplicateIssueId:$target"));
                    Ok(if reject {
                        json!({"errors":[{"message":"Not permitted"}]})
                    } else {
                        json!({"data":{"closeIssue":{"issue":{"state":"CLOSED","stateReason":"DUPLICATE","updatedAt":"2026-01-01T00:00:00Z"}}}})
                    })
                }
                _ => panic!("unexpected operation"),
            }
        };
        let result = TaskClient::new(reader).update_issue(
            &binding(Provider::Github),
            7,
            &IssueStateChange {
                action: IssueAction::Duplicate,
                duplicate_of: Some(8),
            },
        );
        if reject {
            assert_eq!(result.unwrap_err().kind, "mutation_failed");
        } else {
            assert_eq!(
                result.unwrap().metadata.state_reason.as_deref(),
                Some("duplicate")
            );
        }
    }
}

#[test]
fn comments_support_both_providers_and_review_discussions_without_shell_interpolation() {
    for provider in [Provider::Github, Provider::Gitlab] {
        for kind in [TaskKind::Issue, TaskKind::Review] {
            let reader = |_: &Binding,
                          args: &[String],
                          _: &AtomicBool|
             -> Result<Value, TaskFailure> {
                assert_eq!(args[2], "POST");
                let expected = match (provider, kind) {
                    (Provider::Github, _) => "repos/team/demo/issues/7/comments",
                    (Provider::Gitlab, TaskKind::Issue) => "projects/team%2Fdemo/issues/7/notes",
                    (Provider::Gitlab, TaskKind::Review) => {
                        "projects/team%2Fdemo/merge_requests/7/notes"
                    }
                };
                assert_eq!(args[5], expected);
                assert_eq!(field(args, "body"), "**Review**\n`literal` & $value");
                Ok(
                    json!({"id":12,"body":"**Review**\n`literal` & $value","user":{"login":"contributor"},"author":{"username":"contributor"}}),
                )
            };
            let comment = TaskClient::new(reader)
                .add_comment(
                    &binding(provider),
                    kind,
                    7,
                    "**Review**\n`literal` & $value",
                )
                .unwrap();
            assert_eq!(comment.id, 12);
            assert_eq!(comment.author, "contributor");
        }
    }
}

#[test]
fn invalid_or_unsupported_mutations_are_rejected_before_any_remote_request() {
    let client = TaskClient::new(
        |_: &Binding, _: &[String], _: &AtomicBool| -> Result<Value, TaskFailure> {
            panic!("invalid input must not perform requests")
        },
    );
    assert!(client
        .add_comment(&binding(Provider::Github), TaskKind::Issue, 7, "  ")
        .is_err());
    assert!(client
        .update_issue(
            &binding(Provider::Github),
            7,
            &IssueStateChange {
                action: IssueAction::Duplicate,
                duplicate_of: Some(7)
            }
        )
        .is_err());
    assert!(client
        .update_issue(
            &binding(Provider::Gitlab),
            7,
            &IssueStateChange {
                action: IssueAction::NotPlanned,
                duplicate_of: None
            }
        )
        .is_err());
}
