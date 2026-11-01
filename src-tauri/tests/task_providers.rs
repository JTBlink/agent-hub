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

#[test]
fn ported_gitlab_routes_through_environment_instead_of_rejected_hostname_flag() {
    use app_lib::core::task_browser::TaskKind;
    let reader = |_: &Binding, args: &[String], _: &AtomicBool| -> Result<Value, TaskFailure> {
        assert!(!args.iter().any(|arg| arg == "--hostname"));
        assert_eq!(&args[..3], ["api", "--method", "GET"]);
        if args.last().unwrap() == "user" {
            Ok(json!({"username":"demo"}))
        } else {
            Ok(json!([]))
        }
    };
    let binding = Binding {
        id: "00000000-0000-4000-8000-000000000003".into(),
        project_id: "demo".into(),
        provider: Provider::Gitlab,
        host: "git.example.invalid:8443".into(),
        repository: "team/demo".into(),
        launcher: None,
    };
    let filters = Filters {
        kind: TaskKind::Issue,
        ..Filters::default()
    };
    TaskClient::new(reader)
        .list(&binding, &filters, 1, &AtomicBool::new(false))
        .unwrap();
}

#[test]
fn list_queries_share_identity_across_clients_and_refresh_after_auth_failure_or_manual_refresh() {
    use app_lib::core::skill_store::SkillStore;
    use app_lib::core::task_browser::{bindings, refresh_bindings, CliReader};
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    struct Reader {
        scope: String,
        users: Arc<AtomicUsize>,
        reject: Arc<AtomicBool>,
    }
    impl CliReader for Reader {
        fn identity_scope(&self, binding: &Binding) -> Option<String> {
            Some(format!("{}:{:?}", self.scope, binding.provider))
        }
        fn read(
            &self,
            binding: &Binding,
            args: &[String],
            _: &AtomicBool,
        ) -> Result<Value, TaskFailure> {
            let endpoint = args.last().unwrap();
            if endpoint == "user" {
                let number = self.users.fetch_add(1, Ordering::SeqCst) + 1;
                let name = format!("account-{number}");
                return Ok(json!({"login":name,"username":name}));
            }
            if self.reject.swap(false, Ordering::SeqCst) {
                return Err(TaskFailure::new("authentication", "Login expired"));
            }
            if binding.provider == Provider::Github {
                Ok(json!({"total_count":0,"items":[]}))
            } else {
                Ok(json!([]))
            }
        }
    }
    let temp = tempfile::tempdir().unwrap();
    let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
    for provider in [Provider::Github, Provider::Gitlab] {
        let users = Arc::new(AtomicUsize::new(0));
        let reject = Arc::new(AtomicBool::new(false));
        let scope = uuid::Uuid::new_v4().to_string();
        let query = |filters: &Filters, page| {
            TaskClient::new(Reader {
                scope: scope.clone(),
                users: users.clone(),
                reject: reject.clone(),
            })
            .list(
                &Binding {
                    id: uuid::Uuid::new_v4().to_string(),
                    project_id: "demo".into(),
                    provider,
                    host: "git.example.invalid".into(),
                    repository: "team/demo".into(),
                    launcher: None,
                },
                filters,
                page,
                &AtomicBool::new(false),
            )
        };
        assert_eq!(query(&Filters::default(), 1).unwrap().identity, "account-1");
        let assigned = Filters {
            personal: "assigned".into(),
            text: "example".into(),
            ..Filters::default()
        };
        assert_eq!(query(&assigned, 2).unwrap().identity, "account-1");
        assert_eq!(users.load(Ordering::SeqCst), 1);
        bindings(&store).unwrap();
        assert_eq!(query(&assigned, 1).unwrap().identity, "account-1");
        assert_eq!(users.load(Ordering::SeqCst), 1);
        reject.store(true, Ordering::SeqCst);
        assert_eq!(query(&assigned, 1).unwrap_err().kind, "authentication");
        assert_eq!(query(&assigned, 1).unwrap().identity, "account-2");
        refresh_bindings(&store).unwrap();
        assert_eq!(query(&assigned, 1).unwrap().identity, "account-3");
    }
}
