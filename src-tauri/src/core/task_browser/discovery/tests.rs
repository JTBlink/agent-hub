use super::*;

#[test]
fn recognizes_cli_authenticated_enterprise_hosts_without_copying_credentials() {
    let gh = status_hosts(
        "ghe.example.invalid\n  ✓ Logged in to ghe.example.invalid account demo (keyring)\n",
    );
    let gl = status_hosts(
        "git.example.invalid:8443\n  ✓ Logged in to git.example.invalid:8443 as demo\n",
    );
    let first = source("demo", "ghe.example.invalid/team/demo", &gh, &gl).unwrap();
    assert_eq!(first.provider, Provider::Github);
    assert!(first.launcher.is_none());
    assert_eq!(
        first.id,
        source("demo", "ghe.example.invalid/team/demo", &gh, &gl)
            .unwrap()
            .id
    );
    let second = source("demo", "git.example.invalid:8443/team/sub/demo", &gh, &gl).unwrap();
    assert_eq!(second.provider, Provider::Gitlab);
    assert_eq!(second.host, "git.example.invalid:8443");
    assert!(source("demo", "unknown.example.invalid/team/demo", &gh, &gl).is_none());
    assert!(source("demo", "ghe.example.invalid/team/demo", &gh, &gh).is_none());
}

#[test]
fn registered_remote_loads_without_binding_and_respects_removal_and_override() {
    use crate::core::skill_store::ProjectRecord;
    let temp = tempfile::tempdir().unwrap();
    let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
    let path = temp.path().join("project");
    let repo = git2::Repository::init(&path).unwrap();
    repo.remote("origin", "git@github.com:team/demo.git")
        .unwrap();
    store
        .insert_project(&ProjectRecord {
            id: "demo".into(),
            name: "Demo".into(),
            path: path.to_string_lossy().into(),
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
    let hosts = || panic!("public remotes must not probe CLI login");
    let discovered = discover(&store, vec![], hosts).unwrap();
    assert_eq!(discovered.len(), 1);
    assert_eq!(discovered[0].repository, "team/demo");
    assert!(store
        .get_setting(super::super::SETTINGS_KEY)
        .unwrap()
        .is_none());
    let mut unrelated = store.get_all_projects().unwrap().remove(0);
    unrelated.id = "unrelated".into();
    unrelated.path = temp.path().join("unrelated").to_string_lossy().into();
    let unrelated_repo = git2::Repository::init(&unrelated.path).unwrap();
    unrelated_repo
        .remote("origin", "git@unknown.example.invalid:team/other.git")
        .unwrap();
    store.insert_project(&unrelated).unwrap();
    let selected = discover_matching(
        &store,
        vec![],
        || panic!("unrelated hosts must not be probed"),
        Some(&discovered[0].id),
    )
    .unwrap();
    assert_eq!(selected.len(), 1);
    assert_eq!(selected[0].id, discovered[0].id);
    unrelated_repo.remote_delete("origin").unwrap();
    let mut explicit = discovered[0].clone();
    explicit.launcher = Some(super::super::CliLauncher {
        program: "project-launcher".into(),
        args: vec![],
    });
    let saved = discover(&store, vec![explicit], || {
        panic!("explicit launcher must not be replaced by a global CLI")
    })
    .unwrap();
    assert_eq!(
        saved[0].launcher.as_ref().unwrap().program,
        "project-launcher"
    );
    exclude(&store, &discovered[0].id, None).unwrap();
    assert!(discover(&store, vec![], hosts).unwrap().is_empty());
    store.set_setting(EXCLUDED, "[]").unwrap();
    // Adding an upstream must require a deliberate remote choice.
    repo.remote("upstream", "git@github.com:upstream/demo.git")
        .unwrap();
    assert!(discover(&store, vec![], hosts).unwrap().is_empty());
    repo.remote_delete("upstream").unwrap();
    repo.remote_set_url("origin", "git@git.example.invalid:team/demo.git")
        .unwrap();
    let enterprise = discover(&store, vec![], || {
        (
            HashSet::from(["github.com".into()]),
            HashSet::from(["git.example.invalid".into()]),
        )
    })
    .unwrap();
    assert_eq!(enterprise.len(), 1);
    assert_eq!(enterprise[0].provider, Provider::Gitlab);
}

#[test]
fn configured_private_sites_classify_ssh_remotes_using_host_metadata() {
    use crate::core::{
        platforms::accounts::{remember, AccountTarget},
        skill_store::ProjectRecord,
    };
    let temp = tempfile::tempdir().unwrap();
    let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
    for (id, host) in [
        ("first", "git-a.example.invalid"),
        ("second", "git-b.example.invalid"),
    ] {
        let path = temp.path().join(id);
        let repo = git2::Repository::init(&path).unwrap();
        repo.remote("origin", &format!("git@{host}:team/{id}.git"))
            .unwrap();
        store
            .insert_project(&ProjectRecord {
                id: id.into(),
                name: id.into(),
                path: path.to_string_lossy().into(),
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
        remember(
            &store,
            &AccountTarget {
                context_id: "default-gitlab".into(),
                provider: Provider::Gitlab,
                host: host.into(),
            },
        )
        .unwrap();
    }
    let sources = discover(&store, vec![], default_hosts).unwrap();
    assert_eq!(sources.len(), 2);
    assert!(sources
        .iter()
        .all(|source| source.provider == Provider::Gitlab));
    assert_ne!(sources[0].host, sources[1].host);
}
