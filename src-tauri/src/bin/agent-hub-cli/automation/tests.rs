use clap::Parser;
#[derive(Parser)]
struct Cli {
    #[command(flatten)]
    args: super::AutomationArgs,
}

#[test]
fn reads_multi_script_drafts_using_the_package_json_budget() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("task.json");
    let input = serde_json::json!({
        "name": "Example task", "provider": "system", "content": "sh scripts/run.sh",
        "schedule": {"kind": "manual"}, "enabled": false,
        "files": (0..3).map(|index| serde_json::json!({
            "path": format!("scripts/part-{index}.py"), "content": "x".repeat(60 * 1024)
        })).collect::<Vec<_>>()
    });
    std::fs::write(&path, serde_json::to_vec(&input).unwrap()).unwrap();
    assert_eq!(super::draft(&path).unwrap().files.len(), 3);

    std::fs::File::create(&path)
        .unwrap()
        .set_len(4 * 1024 * 1024 + 1)
        .unwrap();
    assert!(super::draft(&path)
        .unwrap_err()
        .to_string()
        .contains("regular files"));
}
#[test]
fn parses_management_and_origin_filters_without_opening_a_database() {
    assert!(Cli::try_parse_from([
        "cli",
        "list",
        "--origin",
        "agent-hub",
        "--source",
        "system",
        "--show-system"
    ])
    .is_ok());
    assert!(Cli::try_parse_from(["cli", "create", "--file", "task.json"]).is_ok());
    assert!(Cli::try_parse_from([
        "cli",
        "copy",
        "exact-id",
        "--name",
        "Review copy",
        "--revision",
        "2"
    ])
    .is_ok());
    assert!(Cli::try_parse_from(["cli", "run", "exact-id"]).is_ok());
    assert!(Cli::try_parse_from(["cli", "remove", "exact-id", "--delete-local-data"]).is_ok());
    assert!(Cli::try_parse_from(["cli", "create", "--template", "workspace-check"]).is_ok());
    assert!(Cli::try_parse_from([
        "cli",
        "create",
        "--template",
        "workspace-check",
        "--file",
        "task.json"
    ])
    .is_err());
    assert!(Cli::try_parse_from(["cli", "templates", "--locale", "en"]).is_ok());
    assert!(Cli::try_parse_from(["cli", "restore", "id", "--apply"]).is_ok());
    assert!(Cli::try_parse_from([
        "cli",
        "edit",
        "exact-id",
        "--file",
        "task.json",
        "--revision",
        "2"
    ])
    .is_ok());
}

#[test]
fn lists_only_agent_hub_tasks_by_default() {
    let cli = Cli::try_parse_from(["cli", "list"]).unwrap();
    assert!(matches!(
        cli.args.command,
        super::AutomationCommand::List {
            origin: super::Origin::AgentHub,
            source: super::Source::All,
            show_system: false,
            ..
        }
    ));
}

#[test]
fn allows_explicit_all_and_external_task_origins() {
    let cli = Cli::try_parse_from(["cli", "list", "--origin", "all", "--show-system"]).unwrap();
    assert!(matches!(
        cli.args.command,
        super::AutomationCommand::List {
            origin: super::Origin::All,
            show_system: true,
            ..
        }
    ));
    let cli = Cli::try_parse_from(["cli", "list", "--origin", "external"]).unwrap();
    assert!(matches!(
        cli.args.command,
        super::AutomationCommand::List {
            origin: super::Origin::External,
            ..
        }
    ));
}

#[test]
fn exposes_import_without_a_separate_installation_lifecycle() {
    assert!(Cli::try_parse_from(["cli", "import", "--path", "task.json"]).is_ok());
    assert!(Cli::try_parse_from(["cli", "import", "--path", "task.json", "--preview"]).is_ok());
    assert!(Cli::try_parse_from(["cli", "import", "--path", "task.json", "--install"]).is_err());
    assert!(Cli::try_parse_from(["cli", "install", "task-id"]).is_err());
    assert!(Cli::try_parse_from(["cli", "uninstall", "task-id"]).is_err());
}
