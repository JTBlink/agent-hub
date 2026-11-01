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
