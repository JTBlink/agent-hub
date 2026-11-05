#![cfg(all(feature = "github", feature = "gitlab"))]
use app_lib::core::task_browser::{Binding, Provider, TaskClient, TaskFailure, TaskKind};
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;

fn binding(provider: Provider) -> Binding {
    Binding {
        id: "00000000-0000-4000-8000-000000000001".into(),
        project_id: "demo".into(),
        provider,
        host: "git.example.invalid".into(),
        repository: "team/demo".into(),
        launcher: None,
    }
}

#[test]
fn gitlab_mr_exposes_developer_facts_without_inventing_conflict_results() {
    let reader = |_: &Binding, args: &[String], _: &AtomicBool| -> Result<Value, TaskFailure> {
        let endpoint = args.last().unwrap();
        if endpoint.contains("/diffs?") {
            return Ok(
                json!([{"new_path":"src/parser.rs","old_path":"src/parser.rs","diff":"@@ -1 +1 @@\n-old\n+new","new_file":false}]),
            );
        }
        if endpoint.contains("/commits?") {
            return Ok(
                json!([{"id":"abcdef123456","title":"Improve parser","author_name":"demo","created_at":"2026-01-01T00:00:00Z"}]),
            );
        }
        if endpoint.ends_with("/merge_requests/7") {
            return Ok(json!({
                "iid":7,"title":"Improve parser","state":"opened","description":"## Acceptance\n- [ ] Handle errors",
                "web_url":"https://git.example.invalid/team/demo/-/merge_requests/7", "author":{"username":"author"},
                "labels":["priority::high","parser"],"milestone":{"title":"v2"},"draft":false,
                "source_branch":"fix/parser","target_branch":"main","sha":"abcdef123456",
                "detailed_merge_status":"checking","has_conflicts":false,"blocking_discussions_resolved":false,
                "changes_count":"12","reviewers":[{"username":"reviewer"}],
                "head_pipeline":{"id":20,"status":"failed","sha":"abcdef123456","web_url":"https://git.example.invalid/team/demo/-/pipelines/20"}
            }));
        }
        if endpoint.ends_with("/approvals") {
            return Ok(
                json!({"approvals_required":2,"approvals_left":1,"approved_by":[{"user":{"username":"reviewer"}}]}),
            );
        }
        if endpoint.contains("/closes_issues?") {
            return Ok(
                json!([{"iid":3,"title":"Parser failure","web_url":"https://git.example.invalid/team/demo/-/issues/3"}]),
            );
        }
        if endpoint.contains("/discussions?") {
            return Ok(
                json!([{"notes":[{"author":{"username":"reviewer"},"body":"Check this branch", "resolved":false,"position":{"new_path":"src/parser.rs","new_line":12}}]}]),
            );
        }
        assert!(endpoint.contains("/notes?"));
        Ok(json!([]))
    };
    let detail = TaskClient::new(reader)
        .detail(
            &binding(Provider::Gitlab),
            TaskKind::Review,
            7,
            1,
            &AtomicBool::new(false),
        )
        .unwrap();
    assert_eq!(detail.summary.metadata.author.as_deref(), Some("author"));
    assert_eq!(detail.summary.metadata.labels, ["priority::high", "parser"]);
    let review = detail.summary.metadata.review.unwrap();
    assert_eq!(review.has_conflicts, None);
    assert_eq!(review.source_branch.as_deref(), Some("fix/parser"));
    assert_eq!(review.pipeline.unwrap().status, "failed");
    assert_eq!(detail.development.approvals_left, Some(1));
    assert_eq!(detail.development.related[0].kind, "closes");
    assert_eq!(
        detail.development.reviews[1].path.as_deref(),
        Some("src/parser.rs")
    );
    assert_eq!(detail.development.reviews[1].line, Some(12));
    assert_eq!(detail.development.files[0].path, "src/parser.rs");
    assert_eq!(detail.development.files[0].status, "modified");
    assert!(detail.development.files[0]
        .patch
        .as_ref()
        .unwrap()
        .contains("+new"));
    assert_eq!(detail.development.commits[0].message, "Improve parser");
    assert!(detail.development.warnings.is_empty());
}

#[test]
fn optional_review_and_check_failures_preserve_readable_github_details() {
    let reader = |_: &Binding, args: &[String], _: &AtomicBool| -> Result<Value, TaskFailure> {
        let endpoint = args.last().unwrap();
        if endpoint.ends_with("/pulls/7") {
            return Ok(
                json!({"number":7,"title":"A change","state":"closed","merged_at":"2026-01-01T00:00:00Z","body":"Keep this body","user":{"login":"author"},"head":{"ref":"topic","sha":"abcdef"},"base":{"ref":"main"},"additions":12,"deletions":3,"changed_files":2,"commits":1}),
            );
        }
        if endpoint.starts_with("repos/team/demo/issues/7/comments?") {
            return Ok(json!([]));
        }
        Err(TaskFailure::new("permission", "Resource unavailable"))
    };
    let detail = TaskClient::new(reader)
        .detail(
            &binding(Provider::Github),
            TaskKind::Review,
            7,
            1,
            &AtomicBool::new(false),
        )
        .unwrap();
    assert_eq!(detail.body, "Keep this body");
    assert_eq!(detail.summary.state, "merged");
    assert_eq!(detail.summary.metadata.review.unwrap().additions, Some(12));
    assert!(detail.development.warnings.contains(&"checks".into()));
    assert!(detail.development.warnings.contains(&"reviews".into()));
}

#[test]
fn later_discussion_pages_do_not_repeat_development_queries() {
    let reader = |_: &Binding, args: &[String], _: &AtomicBool| -> Result<Value, TaskFailure> {
        let endpoint = args.last().unwrap();
        if endpoint.ends_with("/issues/7") {
            return Ok(json!({"iid":7,"title":"Issue","state":"opened"}));
        }
        assert!(endpoint.ends_with("/notes?per_page=25&page=2"));
        Ok(json!([]))
    };
    let detail = TaskClient::new(reader)
        .detail(
            &binding(Provider::Gitlab),
            TaskKind::Issue,
            7,
            2,
            &AtomicBool::new(false),
        )
        .unwrap();
    assert!(detail.development.related.is_empty());
    assert!(detail.development.warnings.is_empty());
}

#[test]
fn unavailable_discussion_keeps_issue_body_and_related_information() {
    let reader = |_: &Binding, args: &[String], _: &AtomicBool| -> Result<Value, TaskFailure> {
        let endpoint = args.last().unwrap();
        if endpoint.ends_with("/issues/7") {
            return Ok(
                json!({"iid":7,"title":"Issue","state":"opened","description":"Read this body"}),
            );
        }
        if endpoint.contains("/notes?") {
            return Err(TaskFailure::new("permission", "Discussion unavailable"));
        }
        assert!(endpoint.contains("/related_merge_requests?"));
        Ok(
            json!([{"iid":9,"title":"Fix issue","web_url":"https://git.example.invalid/team/demo/-/merge_requests/9"}]),
        )
    };
    let detail = TaskClient::new(reader)
        .detail(
            &binding(Provider::Gitlab),
            TaskKind::Issue,
            7,
            1,
            &AtomicBool::new(false),
        )
        .unwrap();
    assert_eq!(detail.body, "Read this body");
    assert_eq!(detail.development.related[0].number, Some(9));
    assert_eq!(detail.development.warnings, ["discussion"]);
    assert!(detail.comments.is_empty());
}
