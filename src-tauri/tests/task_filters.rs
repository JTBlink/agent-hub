use app_lib::core::task_browser::{Binding, Filters, Provider, TaskClient, TaskFailure, TaskKind};
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

#[test]
fn combined_filters_reach_both_providers_and_remain_scoped_on_later_pages() {
    for provider in [Provider::Github, Provider::Gitlab] {
        let reader = |_: &Binding, args: &[String], _: &AtomicBool| -> Result<Value, TaskFailure> {
            let endpoint = args.last().unwrap();
            if endpoint == "user" {
                return Ok(json!({"login":"current-user","username":"current-user"}));
            }
            let url =
                reqwest::Url::parse(&format!("https://git.example.invalid/{endpoint}")).unwrap();
            let query: std::collections::HashMap<_, _> = url.query_pairs().collect();
            assert!(matches!(query["page"].as_ref(), "1" | "2"));
            if provider == Provider::Github {
                assert_eq!(query["q"], "repo:team/demo is:issue state:closed author:\"contributor\" assignee:\"current-user\" label:\"needs review\" label:\"priority::high\" \"parser & error\"");
                Ok(json!({"total_count":26,"items":[]}))
            } else {
                assert_eq!(url.path(), "/projects/team%2Fdemo/issues");
                for (key, expected) in [
                    ("scope", "all"),
                    ("state", "closed"),
                    ("author_username", "contributor"),
                    ("assignee_username[]", "current-user"),
                    ("labels", "needs review,priority::high"),
                    ("search", "parser & error"),
                ] {
                    assert_eq!(query[key], expected);
                }
                Ok(json!([]))
            }
        };
        let client = TaskClient::new(reader);
        let filters = Filters {
            state: "closed".into(),
            author: Some("contributor".into()),
            assignee: Some("@me".into()),
            labels: vec!["needs review".into(), "priority::high".into()],
            text: "parser & error".into(),
            ..Filters::default()
        };
        for page in [1, 2] {
            client
                .list(&binding(provider), &filters, page, &AtomicBool::new(false))
                .unwrap();
        }
    }
}

#[test]
fn review_states_map_to_provider_queries_and_search_results_keep_merged_state() {
    for provider in [Provider::Github, Provider::Gitlab] {
        for state in ["open", "closed", "merged", "draft", "all"] {
            let reader = |_: &Binding,
                          args: &[String],
                          _: &AtomicBool|
             -> Result<Value, TaskFailure> {
                let endpoint = args.last().unwrap();
                if endpoint == "user" {
                    return Ok(json!({"login":"demo","username":"demo"}));
                }
                let decoded = urlencoding::decode(endpoint).unwrap();
                if provider == Provider::Github {
                    match state {
                        "closed" => assert!(decoded.contains("is:closed -is:merged")),
                        "merged" => assert!(decoded.contains("is:merged")),
                        "draft" => assert!(decoded.contains("is:open draft:true")),
                        "all" => assert!(!decoded.contains("state:")),
                        _ => assert!(decoded.contains("state:open")),
                    }
                    Ok(
                        json!({"total_count":1,"items":[{"number":7,"state":"closed","pull_request":{"merged_at":"2026-01-01T00:00:00Z"}}]}),
                    )
                } else {
                    let expected = match state {
                        "open" | "draft" => "opened",
                        state => state,
                    };
                    assert!(decoded.contains(&format!("state={expected}&")));
                    assert_eq!(decoded.contains("&wip=yes"), state == "draft");
                    Ok(json!([]))
                }
            };
            let page = TaskClient::new(reader)
                .list(
                    &binding(provider),
                    &Filters {
                        kind: TaskKind::Review,
                        state: state.into(),
                        ..Filters::default()
                    },
                    1,
                    &AtomicBool::new(false),
                )
                .unwrap();
            if provider == Provider::Github {
                assert_eq!(page.items[0].state, "merged");
            }
        }
    }
}

#[test]
fn invalid_filters_fail_before_network_reads_and_old_clients_remain_compatible() {
    let client = TaskClient::new(
        |_: &Binding, _: &[String], _: &AtomicBool| -> Result<Value, TaskFailure> {
            panic!("invalid filters must not issue requests")
        },
    );
    for filters in [
        Filters {
            state: "merged".into(),
            ..Filters::default()
        },
        Filters {
            labels: vec!["one,two".into()],
            ..Filters::default()
        },
    ] {
        assert_eq!(
            client
                .list(
                    &binding(Provider::Gitlab),
                    &filters,
                    1,
                    &AtomicBool::new(false)
                )
                .unwrap_err()
                .kind,
            "invalid_input"
        );
    }
    let old: Filters =
        serde_json::from_value(json!({"kind":"issue","state":"all","text":"","personal":"all"}))
            .unwrap();
    assert!(old.labels.is_empty());
    assert!(old.author.is_none());
}
