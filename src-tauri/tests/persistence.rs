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
    assert_eq!(diagnostics.schema_version, 3);
    assert_eq!(diagnostics.journal_mode, "wal");
    assert!(diagnostics.foreign_keys_enabled);
    assert_eq!(diagnostics.database_path, path);
}

#[test]
fn relocating_user_data_updates_recorded_backup_paths() {
    let directory = tempdir().expect("temporary directory");
    let database_path = directory.path().join("agent-hub.sqlite3");
    let previous_root = directory.path().join("legacy-data/backups");
    let current_root = directory.path().join(".agenthub/backups");
    let previous_backup = previous_root.join("42/before");
    let database = Database::open(&database_path).expect("database opens");
    database
        .record_backup(&NewConfigBackup {
            config_file_id: None,
            backup_path: previous_backup.to_string_lossy().into_owned(),
            original_checksum: "before".into(),
            operation_type: "migration-fixture".into(),
        })
        .expect("backup metadata");

    assert_eq!(
        database
            .relocate_backup_paths(&previous_root, &current_root)
            .expect("backup paths relocate"),
        1
    );
    drop(database);

    let connection = rusqlite::Connection::open(database_path).expect("database reopens");
    let stored_path: String = connection
        .query_row("SELECT backup_path FROM config_backups", [], |row| {
            row.get(0)
        })
        .expect("stored backup path");
    assert_eq!(
        stored_path,
        current_root.join("42/before").to_string_lossy()
    );
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
            source_type: agent_hub_lib::skills::SourceKind::Git,
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
    reopened
        .set_setting(AppSetting::LastLocalSkillSource("/projects/skills".into()))
        .expect("local Skill source is saved");
    assert_eq!(
        reopened
            .setting(SettingKey::LastLocalSkillSource)
            .expect("local Skill source loads"),
        Some(AppSetting::LastLocalSkillSource("/projects/skills".into()))
    );
    assert!(reopened
        .diagnostics()
        .expect("diagnostics load")
        .forbidden_schema_columns
        .is_empty());
}

#[test]
fn skill_install_snapshot_is_atomic_and_idempotent() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("state.sqlite3")).expect("database opens");
    let source = NewSkillSource {
        source_type: agent_hub_lib::skills::SourceKind::Git,
        canonical_locator: "https://github.com/example/skills.git".into(),
        manifest_path: None,
        requested_ref: Some("main".into()),
        resolved_commit: Some("0123456789abcdef0123456789abcdef01234567".into()),
        source_fingerprint: Some("sha256:source".into()),
    };
    let descriptor = NewSkillDescriptor {
        source_id: 0,
        skill_key: "https://github.com/example/skills.git@main#review".into(),
        relative_path: "review".into(),
        entrypoint_path: "review/SKILL.md".into(),
        display_name: "review".into(),
        description: Some("Review changes".into()),
        kind: SkillKind::Standard,
        content_fingerprint: Some("sha256:skill".into()),
        compatibility_json: "{}".into(),
        metadata_json: "{}".into(),
    };
    let installation = NewSkillInstallation {
        skill_id: 0,
        agent: Agent::ClaudeCode,
        scope: Scope::Global,
        workspace_id: None,
        target_path: "/tmp/agent-hub/review".into(),
        installed_revision: source.resolved_commit.clone(),
        installed_fingerprint: Some("sha256:skill".into()),
        enabled: true,
        state: InstallationState::Installed,
        managed_files_json: "[\"SKILL.md\"]".into(),
    };
    let first = database
        .save_skill_installation(&source, &descriptor, &installation)
        .expect("snapshot persists");
    let second = database
        .save_skill_installation(&source, &descriptor, &installation)
        .expect("replay is idempotent");
    assert_eq!(first, second);
    assert_eq!(
        database.storage_summary().expect("summary").skill_sources,
        1
    );
    assert_eq!(database.storage_summary().expect("summary").skills, 1);
    assert_eq!(
        database
            .storage_summary()
            .expect("summary")
            .skill_installations,
        1
    );
    assert!(database
        .set_skill_installation_enabled(&installation.target_path, false)
        .expect("disable persists"));
    assert!(database
        .remove_skill_installation(&installation.target_path)
        .expect("remove persists"));
    assert_eq!(
        database
            .storage_summary()
            .expect("summary")
            .skill_installations,
        0
    );
}

#[test]
fn global_config_indexes_are_upserted_and_history_is_transactional() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("state.sqlite3")).expect("database opens");
    let config = ConfigIndex {
        agent: Agent::Codex,
        scope: Scope::Global,
        normalized_path: "~/.codex/config.toml".into(),
        format: ConfigFormat::Toml,
        checksum: "before".into(),
        parse_status: ParseStatus::Valid,
    };
    let config_id = database
        .upsert_config_index(None, &config)
        .expect("global config is indexed");
    let mut updated = config.clone();
    updated.checksum = "after".into();
    assert_eq!(
        database
            .upsert_config_index(None, &updated)
            .expect("same config is updated"),
        config_id
    );
    assert_eq!(database.config_index_count().expect("count"), 1);

    let backup = NewConfigBackup {
        config_file_id: Some(config_id),
        backup_path: "/app-data/backups/before".into(),
        original_checksum: "before".into(),
        operation_type: "edit".into(),
    };
    let operation = NewConfigOperation {
        config_file_id: Some(config_id),
        operation_type: "edit".into(),
        before_checksum: Some("before".into()),
        after_checksum: Some("after".into()),
        backup_id: None,
        result: "succeeded".into(),
        diagnostic_code: None,
    };
    let operation_id = database
        .record_config_change(&backup, &operation)
        .expect("history is recorded atomically");
    let history = database
        .config_history(Some(&config.normalized_path))
        .expect("history loads");
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].id, operation_id);
    assert_eq!(history[0].agent, Agent::Codex);
    assert_eq!(history[0].format, ConfigFormat::Toml);
    assert_eq!(history[0].backup_path, backup.backup_path);
    assert_eq!(
        database
            .config_history_entry(operation_id)
            .expect("entry loads"),
        Some(history[0].clone())
    );

    let mismatched_operation = NewConfigOperation {
        config_file_id: None,
        ..operation
    };
    assert!(matches!(
        database.record_config_change(&backup, &mismatched_operation),
        Err(PersistenceError::InvalidInput(_))
    ));
    let summary = database.storage_summary().expect("summary");
    assert_eq!(summary.config_backups, 1);
    assert_eq!(summary.config_operations, 1);
}

#[test]
fn config_index_scope_must_match_workspace_association() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("state.sqlite3")).expect("database opens");
    let global = ConfigIndex {
        agent: Agent::OpenCode,
        scope: Scope::Global,
        normalized_path: "~/.config/opencode/opencode.json".into(),
        format: ConfigFormat::Jsonc,
        checksum: "checksum".into(),
        parse_status: ParseStatus::Valid,
    };
    assert!(matches!(
        database.upsert_config_index(Some(1), &global),
        Err(PersistenceError::InvalidInput(_))
    ));
    let workspace = ConfigIndex {
        scope: Scope::Workspace,
        ..global
    };
    assert!(matches!(
        database.upsert_config_index(None, &workspace),
        Err(PersistenceError::InvalidInput(_))
    ));
}

#[test]
fn history_keeps_path_snapshot_after_workspace_record_is_removed() {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("state.sqlite3")).expect("database opens");
    let workspace = NewWorkspace {
        display_name: "AgentHub".into(),
        entered_path: "/work/agent-hub".into(),
        normalized_path: "/work/agent-hub".into(),
        canonical_path: Some("/work/agent-hub".into()),
    };
    let config = ConfigIndex {
        agent: Agent::OpenCode,
        scope: Scope::Workspace,
        normalized_path: "/work/agent-hub/opencode.json".into(),
        format: ConfigFormat::Jsonc,
        checksum: "before".into(),
        parse_status: ParseStatus::Valid,
    };
    let workspace_id = database
        .replace_workspace_scan(&workspace, std::slice::from_ref(&config))
        .expect("scan");
    let config_id = database.config_indexes(workspace_id).expect("index")[0].id;
    let operation_id = database
        .record_config_change(
            &NewConfigBackup {
                config_file_id: Some(config_id),
                backup_path: "/app-data/backups/before".into(),
                original_checksum: "before".into(),
                operation_type: "edit".into(),
            },
            &NewConfigOperation {
                config_file_id: Some(config_id),
                operation_type: "edit".into(),
                before_checksum: Some("before".into()),
                after_checksum: Some("after".into()),
                backup_id: None,
                result: "succeeded".into(),
                diagnostic_code: None,
            },
        )
        .expect("record history");
    assert!(database.remove_workspace(workspace_id).expect("remove"));
    let history = database.config_history(None).expect("history");
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].id, operation_id);
    assert_eq!(history[0].config_file_id, None);
    assert_eq!(history[0].path, config.normalized_path);
    assert_eq!(history[0].scope, Scope::Workspace);
    assert_eq!(history[0].format, ConfigFormat::Jsonc);
}

#[test]
fn version_one_database_upgrades_and_backfills_history_snapshots() {
    let directory = tempdir().expect("temporary directory");
    let path = directory.path().join("state.sqlite3");
    let connection = rusqlite::Connection::open(&path).expect("v1 database");
    connection
        .execute_batch(include_str!("../migrations/0001_initial.sql"))
        .expect("v1 schema");
    connection
        .execute_batch(
            "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
             INSERT INTO schema_migrations (version) VALUES (1);
             INSERT INTO config_files (id, workspace_id, agent, scope, normalized_path, format, checksum, parse_status)
             VALUES (1, NULL, 'codex', 'global', '~/.codex/config.toml', 'toml', 'before', 'valid');
             INSERT INTO config_backups (id, config_file_id, backup_path, original_checksum, operation_type)
             VALUES (1, 1, '/app-data/backups/before', 'before', 'edit');
             INSERT INTO config_operations (id, config_file_id, operation_type, before_checksum, after_checksum, backup_id, result)
             VALUES (1, 1, 'edit', 'before', 'after', 1, 'succeeded');",
        )
        .expect("v1 history");
    drop(connection);

    let database = Database::open(&path).expect("database upgrades");

    assert_eq!(
        database.diagnostics().expect("diagnostics").schema_version,
        3
    );
    let entry = database
        .config_history_entry(1)
        .expect("history query")
        .expect("history entry");
    assert_eq!(entry.agent, Agent::Codex);
    assert_eq!(entry.scope, Scope::Global);
    assert_eq!(entry.path, "~/.codex/config.toml");
    assert_eq!(entry.format, ConfigFormat::Toml);
}
