use agent_hub_lib::persistence::{
    AppSetting, ConfigIndex, ConfigMetadataRepository, Database, NewConfigBackup,
    NewConfigOperation, NewSkillDescriptor, NewSkillInstallation, NewSkillSource, NewWorkspace,
    PersistenceError, SettingKey, SettingsRepository, SkillRepository,
    StorageDiagnosticsRepository, StorageSummaryRepository, Theme, WorkspaceRepository,
};
use agent_hub_lib::{Agent, ConfigFormat, InstallationState, ParseStatus, Scope, SkillKind};
use tempfile::tempdir;

#[test]
fn first_open_creates_and_migrates_the_database() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("agent-hub.sqlite3");

    let database = Database::open(&path).expect("database opens");
    let diagnostics = database.diagnostics().expect("diagnostics are available");

    assert!(path.is_file());
    assert_eq!(diagnostics.schema_version, 1);
    assert_eq!(diagnostics.journal_mode, "wal");
    assert!(diagnostics.foreign_keys_enabled);
    assert_eq!(diagnostics.database_path, path);
}

#[test]
fn normalized_workspace_paths_are_unique() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("state.sqlite3")).expect("database opens");
    let workspace = NewWorkspace {
        display_name: "AgentHub".into(),
        entered_path: "./agent-hub".into(),
        normalized_path: "/work/agent-hub".into(),
        canonical_path: Some("/work/agent-hub".into()),
    };

    database
        .add_workspace(&workspace)
        .expect("first workspace is saved");
    let duplicate = database.add_workspace(&workspace).unwrap_err();

    assert!(matches!(duplicate, PersistenceError::Conflict { .. }));
    assert_eq!(
        database.list_workspaces().expect("workspaces load").len(),
        1
    );
}

#[test]
fn workspace_scan_rolls_back_when_any_config_index_is_invalid() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("state.sqlite3")).expect("database opens");
    let workspace = NewWorkspace {
        display_name: "Broken scan".into(),
        entered_path: "/work/broken".into(),
        normalized_path: "/work/broken".into(),
        canonical_path: Some("/work/broken".into()),
    };
    let configs = vec![
        ConfigIndex {
            agent: Agent::ClaudeCode,
            scope: Scope::Workspace,
            normalized_path: "/work/broken/.claude/settings.json".into(),
            format: ConfigFormat::Json,
            checksum: "sha256:first".into(),
            parse_status: ParseStatus::Valid,
        },
        ConfigIndex {
            agent: Agent::ClaudeCode,
            scope: Scope::Global,
            normalized_path: "/work/broken/invalid.conf".into(),
            format: ConfigFormat::Json,
            checksum: "sha256:second".into(),
            parse_status: ParseStatus::Valid,
        },
    ];

    database
        .replace_workspace_scan(&workspace, &configs)
        .expect_err("invalid scan must fail");

    assert!(database
        .list_workspaces()
        .expect("workspaces load")
        .is_empty());
    assert_eq!(database.config_index_count().expect("count loads"), 0);
}

#[test]
fn repository_metadata_survives_database_reopen_without_storing_file_content() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("state.sqlite3");
    let database = Database::open(&path).expect("database opens");
    let workspace = NewWorkspace {
        display_name: "AgentHub".into(),
        entered_path: "/work/agent-hub".into(),
        normalized_path: "/work/agent-hub".into(),
        canonical_path: Some("/work/agent-hub".into()),
    };
    let config = ConfigIndex {
        agent: Agent::Codex,
        scope: Scope::Workspace,
        normalized_path: "/work/agent-hub/.codex/config.toml".into(),
        format: ConfigFormat::Toml,
        checksum: "sha256:config-before".into(),
        parse_status: ParseStatus::Valid,
    };
    let workspace_id = database
        .replace_workspace_scan(&workspace, &[config])
        .expect("workspace scan is saved");
    let config_id = database
        .config_indexes(workspace_id)
        .expect("config indexes load")[0]
        .id;
    let backup_id = database
        .record_backup(&NewConfigBackup {
            config_file_id: Some(config_id),
            backup_path: "/app-data/backups/config-before".into(),
            original_checksum: "sha256:config-before".into(),
            operation_type: "edit".into(),
        })
        .expect("backup metadata is saved");
    database
        .record_operation(&NewConfigOperation {
            config_file_id: Some(config_id),
            operation_type: "edit".into(),
            before_checksum: Some("sha256:config-before".into()),
            after_checksum: Some("sha256:config-after".into()),
            backup_id: Some(backup_id),
            result: "succeeded".into(),
            diagnostic_code: None,
        })
        .expect("operation metadata is saved");
    let source_id = database
        .add_skill_source(&NewSkillSource {
            source_type: "git".into(),
            canonical_locator: "https://example.invalid/skills.git".into(),
            manifest_path: None,
            requested_ref: Some("main".into()),
            resolved_commit: Some("0123456789abcdef".into()),
            source_fingerprint: Some("sha256:source".into()),
        })
        .expect("Skill source is saved");
    let skill_id = database
        .add_skill_descriptor(&NewSkillDescriptor {
            source_id,
            skill_key: "git:https://example.invalid/skills.git#review".into(),
            relative_path: "review".into(),
            entrypoint_path: "review/SKILL.md".into(),
            display_name: "review".into(),
            description: Some("Reviews changes".into()),
            kind: SkillKind::Standard,
            content_fingerprint: Some("sha256:skill".into()),
            compatibility_json: r#"{"codex":"supported"}"#.into(),
            metadata_json: "{}".into(),
        })
        .expect("Skill descriptor is saved");
    database
        .record_skill_installation(&NewSkillInstallation {
            skill_id,
            agent: Agent::Codex,
            scope: Scope::Workspace,
            workspace_id: Some(workspace_id),
            target_path: "/work/agent-hub/.agents/skills/review".into(),
            installed_revision: Some("0123456789abcdef".into()),
            installed_fingerprint: Some("sha256:skill".into()),
            enabled: true,
            state: InstallationState::Installed,
            managed_files_json: r#"["SKILL.md"]"#.into(),
        })
        .expect("Skill installation is saved");
    drop(database);

    let reopened = Database::open(&path).expect("database reopens");
    let summary = reopened.storage_summary().expect("summary loads");

    assert_eq!(summary.workspaces, 1);
    assert_eq!(summary.config_files, 1);
    assert_eq!(summary.config_backups, 1);
    assert_eq!(summary.config_operations, 1);
    assert_eq!(summary.skill_sources, 1);
    assert_eq!(summary.skills, 1);
    assert_eq!(summary.skill_installations, 1);
}

#[test]
fn application_settings_are_typed_and_schema_audit_rejects_sensitive_columns() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("state.sqlite3");
    let database = Database::open(&path).expect("database opens");

    database
        .set_setting(AppSetting::Theme(Theme::Dark))
        .expect("theme is saved");
    database
        .set_setting(AppSetting::BackupRetentionDays(30))
        .expect("retention is saved");
    drop(database);

    let reopened = Database::open(&path).expect("database reopens");
    assert_eq!(
        reopened.setting(SettingKey::Theme).expect("theme loads"),
        Some(AppSetting::Theme(Theme::Dark))
    );
    assert_eq!(
        reopened
            .setting(SettingKey::BackupRetentionDays)
            .expect("retention loads"),
        Some(AppSetting::BackupRetentionDays(30))
    );
    assert!(reopened
        .diagnostics()
        .expect("diagnostics load")
        .forbidden_schema_columns
        .is_empty());
}
