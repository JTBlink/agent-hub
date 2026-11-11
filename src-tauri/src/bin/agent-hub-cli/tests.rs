use clap::FromArgMatches;

#[test]
fn root_and_nested_help_use_chinese_and_current_group_name() {
    let root = cli_command()
        .try_get_matches_from(["agent-hub-cli", "-h"])
        .unwrap_err()
        .to_string();
    assert!(root.contains("skill-groups"));
    assert!(root.contains("显示帮助"));
    assert!(!root.contains("presets"));
    assert!(!root.contains("Print help"));

    let nested = cli_command()
        .try_get_matches_from(["agent-hub-cli", "skills", "list", "-h"])
        .unwrap_err()
        .to_string();
    assert!(nested.contains("选项:"));
    assert!(nested.contains("搜索关键词"));
    assert!(nested.contains("--skill-group"));
    assert!(!nested.contains("Options:"));
}

#[test]
fn project_status_runs_without_opening_a_personal_library() {
    let tmp = tempfile::tempdir().unwrap();
    let matches = cli_command()
        .try_get_matches_from([
            "agent-hub-cli",
            "--json",
            "project",
            "--path",
            tmp.path().to_str().unwrap(),
            "status",
        ])
        .unwrap();
    let cli = Cli::from_arg_matches(&matches).unwrap();
    let Commands::Project(args) = &cli.command else {
        panic!("expected project command")
    };
    assert!(!args.needs_personal_library());
    run(cli).unwrap();
    assert_eq!(std::fs::read_dir(tmp.path()).unwrap().count(), 0);
}

/// An agent has to name the directory that is in the way and say the
/// contents survived. Flattening the refusal into one sentence is what
/// made that impossible, so the paths must reach the envelope as data.
#[test]
fn a_deployment_refusal_keeps_its_paths_in_the_json_envelope() {
    let err = map_app_err(AppError::target_conflict(
        "拒绝部署：1/2 个目标路径……",
        vec![app_lib::core::error::TargetConflictDetail {
            path: "~/.claude/skills/db".to_string(),
            reason: "is not a managed deployment".to_string(),
            is_skill: false,
        }],
    ));

    let envelope = error_envelope(&err);
    assert_eq!(envelope["ok"], false);
    assert_eq!(envelope["code"], "TARGET_CONFLICT");
    assert_eq!(envelope["kind"], "target_conflict");
    assert_eq!(
        envelope["details"]["conflicts"][0]["path"],
        "~/.claude/skills/db"
    );
}

/// Everything else keeps the shape callers already parse.
#[test]
fn an_ordinary_failure_keeps_the_command_failed_envelope() {
    let envelope = error_envelope(&anyhow!("no agent key provided"));
    assert_eq!(envelope["code"], "COMMAND_FAILED");
    assert_eq!(envelope["message"], "no agent key provided");
    assert!(envelope.get("details").is_none());
}

use super::*;
use app_lib::core::skill_store::{ScenarioRecord, SkillRecord};
use app_lib::core::tool_adapters::{CustomToolDef, ToolCategory};
use std::fs;
use tempfile::tempdir;

#[test]
fn agents_add_custom_registers_the_agent_and_rejects_a_duplicate() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("skills.db")).unwrap();
    let skills = tmp.path().join("hermes-work/skills");
    let args = |key: &str| match Cli::try_parse_from([
        "agent-hub-cli",
        "agents",
        "add-custom",
        key,
        "--path",
        skills.to_str().unwrap(),
        "--name",
        "Hermes Work",
        "--project-path",
        ".hermes/skills",
    ])
    .unwrap()
    .command
    {
        Commands::Tools(args) => args,
        other => panic!("unexpected command {other:?}"),
    };

    run_tools(args("hermes-work"), &store, true).unwrap();
    let custom = tool_service::get_custom_tools(&store);
    assert_eq!(custom.len(), 1);
    assert_eq!(custom[0].key, "hermes-work");
    assert_eq!(custom[0].display_name, "Hermes Work");
    assert_eq!(
        custom[0].project_relative_skills_dir.as_deref(),
        Some(".hermes/skills")
    );

    assert!(run_tools(args("hermes-work"), &store, true).is_err());
    assert_eq!(tool_service::get_custom_tools(&store).len(), 1);
}

#[test]
fn deployment_dry_runs_refuse_a_foreign_target_without_changes() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("skills.db")).unwrap();
    let source = tmp.path().join("central/demo");
    let target_root = tmp.path().join("agent-skills");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&target_root).unwrap();
    fs::write(source.join("SKILL.md"), "# Demo\n").unwrap();
    tool_service::set_custom_tools(
        &store,
        &[CustomToolDef {
            key: "test_agent".to_string(),
            display_name: "Test Agent".to_string(),
            skills_dir: target_root.to_string_lossy().to_string(),
            project_relative_skills_dir: None,
            category: ToolCategory::Coding,
        }],
    )
    .unwrap();
    store
        .insert_skill(&SkillRecord {
            id: "skill-demo".to_string(),
            name: "demo".to_string(),
            description: None,
            source_type: "local".to_string(),
            source_ref: Some(source.to_string_lossy().to_string()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: source.to_string_lossy().to_string(),
            content_hash: None,
            enabled: true,
            created_at: 1,
            updated_at: 1,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: None,
            last_check_error: None,
        })
        .unwrap();
    store
        .insert_scenario(&ScenarioRecord {
            id: "skill-group-demo".to_string(),
            name: "Demo".to_string(),
            description: None,
            icon: None,
            sort_order: 0,
            created_at: 1,
            updated_at: 1,
        })
        .unwrap();
    store
        .add_skill_to_scenario("skill-group-demo", "skill-demo")
        .unwrap();

    let target = target_root.join("demo");
    let foreign = tmp.path().join("foreign");
    fs::create_dir_all(&foreign).unwrap();
    fs::write(foreign.join("mine.txt"), "keep").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&foreign, &target).unwrap();
    #[cfg(not(unix))]
    {
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("mine.txt"), "keep").unwrap();
    }

    let skill_err = run_skill_deployment(
        &store,
        &["demo".to_string()],
        &["test_agent".to_string()],
        true,
        true,
    )
    .unwrap_err();
    let skill_group_err =
        run_skill_group_deployment(&store, "Demo", &["test_agent".to_string()], true, true)
            .unwrap_err();
    let sync_err = run_sync(&store, Some("Demo"), Some("test_agent"), true).unwrap_err();
    assert_eq!(store.get_active_scenario_id().unwrap(), None);
    assert!(store.get_all_targets().unwrap().is_empty());
    let real_skill_err = run_skill_deployment(
        &store,
        &["demo".to_string()],
        &["test_agent".to_string()],
        true,
        false,
    )
    .unwrap_err();
    let real_skill_group_err =
        run_skill_group_deployment(&store, "Demo", &["test_agent".to_string()], true, false)
            .unwrap_err();
    let real_sync_err = run_sync(&store, Some("Demo"), Some("test_agent"), false).unwrap_err();
    for error in [
        skill_err,
        skill_group_err,
        sync_err,
        real_skill_err,
        real_skill_group_err,
        real_sync_err,
    ] {
        let envelope = error_envelope(&error);
        assert_eq!(envelope["code"], "TARGET_CONFLICT");
        assert_eq!(
            envelope["details"]["conflicts"][0]["path"],
            target.to_string_lossy().as_ref()
        );
    }
    assert_eq!(fs::read_to_string(target.join("mine.txt")).unwrap(), "keep");
    assert!(store.get_all_targets().unwrap().is_empty());
}

#[test]
fn parses_agent_friendly_commands_and_aliases() {
    let cli = Cli::try_parse_from([
        "agent-hub-cli",
        "--json",
        "skills",
        "deploy",
        "browser",
        "--to",
        "codex",
        "--agent",
        "claude_code",
        "--dry-run",
    ])
    .unwrap();
    assert!(cli.json);
    assert!(matches!(
        cli.command,
        Commands::Skills(SkillsArgs {
            command: SkillsCommand::Deploy {
                agents,
                dry_run: true,
                ..
            }
        }) if agents == vec!["codex", "claude_code"]
    ));

    let cli = Cli::try_parse_from([
        "agent-hub-cli",
        "skills",
        "list",
        "--query",
        "react",
        "--tag",
        "frontend",
        "--skill-group",
        "Web Dev",
        "--deployed-to",
        "claude_code",
    ])
    .unwrap();
    assert!(matches!(
        cli.command,
        Commands::Skills(SkillsArgs {
            command: SkillsCommand::List {
                query: Some(query),
                tags,
                skill_group: Some(group),
                deployed_to: Some(agent),
                ..
            }
        }) if query == "react"
            && tags == vec!["frontend"]
            && group == "Web Dev"
            && agent == "claude_code"
    ));

    let cli =
        Cli::try_parse_from(["agent-hub-cli", "agents", "enable", "codex", "claude_code"]).unwrap();
    assert!(matches!(
        cli.command,
        Commands::Tools(ToolsArgs {
            command: ToolsCommand::Enable { agents }
        }) if agents == vec!["codex", "claude_code"]
    ));

    let cli = Cli::try_parse_from([
        "agent-hub-cli",
        "skill-groups",
        "open",
        "Web Dev",
        "--agent",
        "codex",
    ])
    .unwrap();
    assert!(matches!(
        cli.command,
        Commands::SkillGroups(SkillGroupArgs {
            command: SkillGroupCommand::Deploy {
                reference,
                agents,
                ..
            }
        }) if reference == "Web Dev" && agents == vec!["codex"]
    ));

    let cli = Cli::try_parse_from(["agent-hub-cli", "presets", "list"]).unwrap();
    assert!(matches!(cli.command, Commands::SkillGroups(_)));

    let cli =
        Cli::try_parse_from(["agent-hub-cli", "skills", "list", "--preset", "Web Dev"]).unwrap();
    assert!(matches!(
        cli.command,
        Commands::Skills(SkillsArgs {
            command: SkillsCommand::List {
                skill_group: Some(group),
                ..
            }
        }) if group == "Web Dev"
    ));
}

#[test]
fn skill_and_skill_group_deployment_round_trip() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("skills.db")).unwrap();
    let source = tmp.path().join("central/demo");
    let target_root = tmp.path().join("agent-skills");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&target_root).unwrap();
    fs::write(
        source.join("SKILL.md"),
        "---\nname: demo\ndescription: test skill\n---\n",
    )
    .unwrap();
    fs::write(source.join("payload.txt"), "managed").unwrap();

    let test_agent = CustomToolDef {
        key: "test_agent".to_string(),
        display_name: "Test Agent".to_string(),
        skills_dir: target_root.to_string_lossy().to_string(),
        project_relative_skills_dir: None,
        category: ToolCategory::Coding,
    };
    tool_service::set_custom_tools(&store, std::slice::from_ref(&test_agent)).unwrap();
    store.set_setting("sync_mode", "copy").unwrap();
    store
        .insert_skill(&SkillRecord {
            id: "skill-demo".to_string(),
            name: "demo".to_string(),
            description: Some("test skill".to_string()),
            source_type: "local".to_string(),
            source_ref: Some(source.to_string_lossy().to_string()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: source.to_string_lossy().to_string(),
            content_hash: None,
            enabled: true,
            created_at: 1,
            updated_at: 1,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: None,
            last_check_error: None,
        })
        .unwrap();

    let dry_run = run_skill_deployment(
        &store,
        &["demo".to_string()],
        &["test_agent".to_string()],
        true,
        true,
    )
    .unwrap();
    assert_eq!(dry_run.changed_pairs, 1);
    assert!(!target_root.join("demo").exists());
    assert!(store.get_all_targets().unwrap().is_empty());

    let deployed = run_skill_deployment(
        &store,
        &["demo".to_string()],
        &["test_agent".to_string()],
        true,
        false,
    )
    .unwrap();
    assert_eq!(deployed.changed_pairs, 1);
    assert_eq!(
        fs::read_to_string(target_root.join("demo/payload.txt")).unwrap(),
        "managed"
    );
    let status = skill_status(&store, "demo").unwrap();
    assert!(status
        .agents
        .iter()
        .any(|agent| agent.key == "test_agent" && agent.deployed));

    let dry_remove = run_skill_deployment(
        &store,
        &["demo".to_string()],
        &["test_agent".to_string()],
        false,
        true,
    )
    .unwrap();
    assert_eq!(dry_remove.changed_pairs, 1);
    assert!(target_root.join("demo").exists());

    run_skill_deployment(
        &store,
        &["demo".to_string()],
        &["test_agent".to_string()],
        false,
        false,
    )
    .unwrap();
    assert!(!target_root.join("demo").exists());
    assert!(store.get_all_targets().unwrap().is_empty());
    let audit_count = store.list_audit(None).unwrap().len();
    let noop_remove = run_skill_deployment(
        &store,
        &["demo".to_string()],
        &["test_agent".to_string()],
        false,
        false,
    )
    .unwrap();
    assert_eq!(noop_remove.changed_pairs, 0);
    assert_eq!(store.list_audit(None).unwrap().len(), audit_count);

    store
        .insert_scenario(&ScenarioRecord {
            id: "skill-group-web".to_string(),
            name: "Web Dev".to_string(),
            description: None,
            icon: None,
            sort_order: 0,
            created_at: 1,
            updated_at: 1,
        })
        .unwrap();
    store
        .add_skill_to_scenario("skill-group-web", "skill-demo")
        .unwrap();

    let deployed =
        run_skill_group_deployment(&store, "Web Dev", &["test_agent".to_string()], true, false)
            .unwrap();
    assert_eq!(deployed.changed_pairs, 1);
    let status = skill_group_status(&store, "Web Dev", &["test_agent".to_string()]).unwrap();
    assert_eq!(status.agents[0].status, "active");

    store
        .set_setting(
            "disabled_tools",
            &serde_json::to_string(&vec!["test_agent"]).unwrap(),
        )
        .unwrap();
    let status = skill_group_status(&store, "Web Dev", &[]).unwrap();
    assert!(status
        .agents
        .iter()
        .any(|agent| agent.key == "test_agent" && agent.status == "active"));

    tool_service::set_custom_tools(&store, &[]).unwrap();
    let status = skill_status(&store, "demo").unwrap();
    assert!(status
        .agents
        .iter()
        .any(|agent| { agent.key == "test_agent" && agent.deployed && !agent.installed }));

    run_skill_group_deployment(&store, "Web Dev", &[], false, false).unwrap();
    tool_service::set_custom_tools(&store, &[test_agent]).unwrap();
    let status = skill_group_status(&store, "Web Dev", &["test_agent".to_string()]).unwrap();
    assert_eq!(status.agents[0].status, "inactive");
    assert!(!target_root.join("demo").exists());

    store.set_setting("disabled_tools", "[]").unwrap();
    let missing_source = tmp.path().join("central/broken");
    store
        .insert_skill(&SkillRecord {
            id: "skill-broken".to_string(),
            name: "broken".to_string(),
            description: Some("missing source".to_string()),
            source_type: "local".to_string(),
            source_ref: Some(missing_source.to_string_lossy().to_string()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            source_agent: None,
            remote_revision: None,
            central_path: missing_source.to_string_lossy().to_string(),
            content_hash: None,
            enabled: true,
            created_at: 1,
            updated_at: 1,
            status: "ok".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: None,
            last_check_error: None,
        })
        .unwrap();
    let audit_count = store.list_audit(None).unwrap().len();
    let error = run_skill_deployment(
        &store,
        &["demo".to_string(), "broken".to_string()],
        &["test_agent".to_string()],
        true,
        false,
    )
    .unwrap_err();
    assert!(error.to_string().contains("deployment incomplete"));
    assert!(target_root.join("demo").exists());
    assert!(!target_root.join("broken").exists());
    let audit = store.list_audit(None).unwrap();
    assert_eq!(audit.len(), audit_count + 1);
    assert_eq!(audit[0].action, "deploy");
    assert_eq!(audit[0].skill_id.as_deref(), Some("skill-demo"));
}

#[test]
fn preview_accepts_negative_scroll_and_literal_hyphen_input() {
    let matches = cli_command()
        .try_get_matches_from(["agent-hub-cli", "preview", "scroll", "page", "--y", "-500"])
        .unwrap();
    let cli = Cli::from_arg_matches(&matches).unwrap();
    assert!(matches!(
        cli.command,
        Commands::Preview(preview_cli::PreviewArgs {
            command: preview_cli::PreviewCommand::Scroll { y: -500., .. }
        })
    ));
    let matches = cli_command()
        .try_get_matches_from([
            "agent-hub-cli",
            "preview",
            "fill",
            "page",
            "snapshot:0",
            "--literal",
        ])
        .unwrap();
    let cli = Cli::from_arg_matches(&matches).unwrap();
    let Commands::Preview(preview_cli::PreviewArgs {
        command: preview_cli::PreviewCommand::Fill { value, .. },
    }) = cli.command
    else {
        panic!("expected fill");
    };
    assert_eq!(value, "--literal");
}
