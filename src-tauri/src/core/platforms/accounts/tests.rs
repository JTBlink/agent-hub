use super::*;
use crate::core::task_browser::CliLauncher;
#[cfg(feature = "github")]
use serde_json::json;

fn fixture(provider: Provider, host: &str) -> (tempfile::TempDir, AccountSession) {
    let temp = tempfile::tempdir().unwrap();
    let script = temp.path().join("cli.sh");
    std::fs::write(&script, r#"#!/bin/sh
root=$(dirname "$0")
printf '%s\n' "$@" >> "$root/arguments"
if [ "$3" = '--help' ]; then printf '%s' '--stdin --use-keyring'; exit 0; fi
host=''
previous=''
for argument in "$@"; do
  if [ "$previous" = '--hostname' ]; then host=$argument; fi
  previous=$argument
done
[ -n "$host" ] || host=$GITLAB_HOST
state="$root/$host"
username=first
[ ! -f "$state" ] || username=$(cat "$state")
if [ "$1 $2" = 'auth login' ]; then
  token=$(cat)
  if [ "$token" != 'fixture-secret' ]; then printf '%s' "$token" >&2; exit 1; fi
  printf 'second' > "$state"
  exit 0
fi
if [ "$1 $2" = 'auth switch' ]; then printf '%s' "$6" > "$state"; exit 0; fi
if [ "$1 $2" = 'auth status' ]; then
  printf '{"hosts":{"%s":[{"login":"%s","active":true,"state":"success","tokenSource":"keyring","token":"fixture-secret"},{"login":"second","active":false,"state":"success","tokenSource":"keyring"}]}}' "$host" "$username"
else
  printf '{"username":"%s","login":"wrong-provider-field"}' "$username"
fi
"#).unwrap();
    let target = AccountTarget {
        context_id: uuid::Uuid::new_v4().to_string(),
        provider,
        host: host.into(),
    };
    let binding = Binding {
        id: target.context_id.clone(),
        provider,
        host: host.into(),
        project_id: "demo".into(),
        repository: "team/demo".into(),
        launcher: Some(CliLauncher {
            program: "/bin/sh".into(),
            args: vec![script.to_string_lossy().into()],
        }),
    };
    let session = AccountSession {
        target,
        binding: Some(binding),
        cwd: temp.path().into(),
    };
    (temp, session)
}
#[cfg(feature = "github")]
#[test]
fn github_lists_only_safe_metadata_and_switches_a_saved_account() {
    let (_temp, session) = fixture(Provider::Github, "github.example.invalid");
    let accounts = session.list(&AtomicBool::new(false)).unwrap();
    assert_eq!(accounts.len(), 2);
    assert!(!serde_json::to_string(&accounts)
        .unwrap()
        .contains("fixture-secret"));
    assert_eq!(session.switch("second").unwrap()[0].username, "second");
    assert!(session.switch("unknown").is_err());
    assert_eq!(
        session.list(&AtomicBool::new(true)).unwrap_err().kind,
        "cancelled"
    );
}
#[cfg(feature = "gitlab")]
#[test]
fn gitlab_preserves_multiple_private_hosts_and_uses_stdin_and_keyring_for_token_login() {
    let (temp, mut session) = fixture(Provider::Gitlab, "git-a.example.invalid:8443");
    assert_eq!(
        session.token_login("fixture-secret").unwrap()[0].username,
        "second"
    );
    session.target.host = "git-b.example.invalid".into();
    assert_eq!(
        session.list(&AtomicBool::new(false)).unwrap()[0].username,
        "first"
    );
    assert_eq!(
        session.token_login("fixture-secret").unwrap()[0].username,
        "second"
    );
    session.target.host = "git-a.example.invalid:8443".into();
    assert_eq!(
        session.list(&AtomicBool::new(false)).unwrap()[0].username,
        "second"
    );
    assert!(session.switch("second").is_err());
    let error = session.token_login("bad-secret-marker").unwrap_err();
    assert_eq!(error.kind, "authentication");
    assert!(!serde_json::to_string(&error)
        .unwrap()
        .contains("bad-secret-marker"));
    let args = std::fs::read_to_string(temp.path().join("arguments")).unwrap();
    assert!(args.contains("--stdin"));
    assert!(args.contains("--use-keyring"));
    assert!(!args.contains("fixture-secret"));
    assert!(!args.contains("bad-secret-marker"));
    let spec = session.login(TerminalSize { rows: 20, cols: 80 }).unwrap();
    assert_eq!(spec.cwd, temp.path());
    assert_eq!(spec.command.get_argv()[0], "/bin/sh");
    assert!(!format!("{:?}", spec.command.get_argv()).contains("--web"));
}
#[test]
fn remembers_only_host_metadata_without_projects_and_can_forget_it() {
    let temp = tempfile::tempdir().unwrap();
    let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
    let provider = if cfg!(feature = "gitlab") {
        Provider::Gitlab
    } else {
        Provider::Github
    };
    for host in ["git-a.example.invalid", "git-b.example.invalid"] {
        let target = AccountTarget {
            context_id: format!("default-{}", provider_name(provider)),
            provider,
            host: host.into(),
        };
        remember(&store, &target).unwrap();
        remember(&store, &target).unwrap();
        assert!(AccountSession::resolve(&store, target).is_ok());
    }
    let saved = contexts_with_hosts(&store, Vec::new).unwrap();
    assert_eq!(saved.iter().filter(|context| context.remembered).count(), 2);
    let target = AccountTarget {
        context_id: format!("default-{}", provider_name(provider)),
        provider,
        host: "git-a.example.invalid".into(),
    };
    forget(&store, &target).unwrap();
    assert_eq!(
        contexts_with_hosts(&store, Vec::new)
            .unwrap()
            .iter()
            .filter(|context| context.remembered)
            .count(),
        1
    );
    assert!(AccountSession::resolve(
        &store,
        AccountTarget {
            host: "https://user:password@example.invalid/path".into(),
            ..target
        }
    )
    .is_err());
    assert!(AccountSession::resolve(
        &store,
        AccountTarget {
            context_id: uuid::Uuid::new_v4().to_string(),
            provider,
            host: "git.example.invalid".into()
        }
    )
    .is_err());
    assert!(super::super::cli::validate_host("git\texample.invalid").is_err());
}
#[cfg(feature = "github")]
#[test]
fn environment_owned_github_credentials_are_not_switchable() {
    let adapter = Provider::Github.account_adapter().unwrap();
    let values=(adapter.parse)("github.com",json!({"hosts":{"github.com":[{"login":"demo","state":"success","active":true,"tokenSource":"GH_TOKEN"}]}})).unwrap();
    assert!(!values[0].switchable);
}

#[test]
fn project_launchers_remain_distinct_and_cannot_be_retargeted_to_another_host() {
    use crate::core::skill_store::ProjectRecord;
    let provider = if cfg!(feature = "gitlab") {
        Provider::Gitlab
    } else {
        Provider::Github
    };
    let (_fixture, template) = fixture(provider, "git.example.invalid");
    let temp = tempfile::tempdir().unwrap();
    let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
    for id in ["first", "second"] {
        std::fs::create_dir(temp.path().join(id)).unwrap();
        store
            .insert_project(&ProjectRecord {
                id: id.into(),
                name: id.into(),
                path: temp.path().join(id).to_string_lossy().into(),
                workspace_type: "project".into(),
                linked_agent_key: None,
                linked_agent_name: None,
                disabled_path: None,
                sort_order: 0,
                created_at: 0,
                updated_at: 0,
                visited_at: None,
            })
            .unwrap();
        let mut binding = template.binding.clone().unwrap();
        binding.id = uuid::Uuid::new_v4().to_string();
        binding.project_id = id.into();
        task_browser::save_binding(&store, binding).unwrap();
    }
    let contexts = contexts_with_hosts(&store, Vec::new).unwrap();
    let scoped: Vec<_> = contexts
        .iter()
        .filter(|context| context.project_scoped)
        .collect();
    assert_eq!(scoped.len(), 2);
    let target = AccountTarget {
        context_id: scoped[0].id.clone(),
        provider,
        host: scoped[0].host.clone(),
    };
    let session = AccountSession::resolve(&store, target.clone()).unwrap();
    assert_eq!(
        session.cwd,
        temp.path().join(&scoped[0].label).canonicalize().unwrap()
    );
    assert_eq!(
        session.binding.unwrap().launcher.unwrap().program,
        "/bin/sh"
    );
    assert!(AccountSession::resolve(
        &store,
        AccountTarget {
            host: "other.example.invalid".into(),
            ..target
        }
    )
    .is_err());
}
