use clap::Parser;
#[derive(Parser)]
struct Cli {
    #[command(flatten)]
    args: super::AutomationArgs,
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
