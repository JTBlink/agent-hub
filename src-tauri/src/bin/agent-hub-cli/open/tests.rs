use super::*;

fn arguments(values: &[&str]) -> Vec<OsString> {
    values.iter().map(OsString::from).collect()
}

#[test]
fn file_shorthand_retains_global_options_before_and_after_the_path() {
    for args in [
        vec!["agent-hub-cli", "--json", "./a file.md"],
        vec!["agent-hub-cli", "./a file.md", "--json"],
        vec!["agent-hub-cli", "open", "./a file.md", "--json"],
    ] {
        let cli = parse(arguments(&args)).unwrap();
        assert!(cli.json);
        let super::super::Commands::Open(args) = cli.command else {
            panic!("expected open")
        };
        assert_eq!(args.path, PathBuf::from("./a file.md"));
    }
}

#[test]
fn a_global_option_value_does_not_get_rewritten_as_the_file_argument() {
    let cli = parse(arguments(&[
        "agent-hub-cli",
        "--skills-root",
        "./guide.md",
        "./guide.md",
        "--json",
    ]))
    .unwrap();
    assert_eq!(cli.skills_root, Some("./guide.md".into()));
    assert!(cli.json);
    assert!(matches!(cli.command, super::super::Commands::Open(_)));
    assert!(super::super::run(cli)
        .unwrap_err()
        .to_string()
        .contains("--skills-root"));
}

#[test]
fn ordinary_commands_and_typo_diagnostics_remain_unchanged() {
    let cli = parse(arguments(&["agent-hub-cli", "--json", "skills", "list"])).unwrap();
    assert!(matches!(cli.command, super::super::Commands::Skills(_)));
    let error = parse(arguments(&["agent-hub-cli", "skils", "list"])).unwrap_err();
    assert!(error.to_string().contains("skills"));
    assert!(parse(arguments(&["agent-hub-cli", "skills", "./guide.md"])).is_err());
}

#[test]
fn invalid_files_are_rejected_before_connecting_to_the_desktop() {
    let root = tempfile::tempdir().unwrap();
    for path in [root.path().to_path_buf(), root.path().join("missing.md")] {
        assert!(run(&OpenArgs { path }, true).is_err());
    }
}
