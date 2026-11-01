use super::*;

#[test]
fn test_fresh_database_migrates_to_latest() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();

    run_migrations(&conn).unwrap();

    let version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, LATEST_VERSION);

    // Verify tables exist
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    assert!(tables.contains(&"skills".to_string()));
    assert!(tables.contains(&"skill_targets".to_string()));
    assert!(tables.contains(&"scenarios".to_string()));
    assert!(tables.contains(&"projects".to_string()));
    assert!(tables.contains(&"skill_tags".to_string()));
    assert!(tables.contains(&"scenario_skill_tools".to_string()));
    assert!(tables.contains(&"audit_log".to_string()));
}

#[test]
fn test_idempotent_migration() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();

    run_migrations(&conn).unwrap();
    // Running again should be a no-op
    run_migrations(&conn).unwrap();

    let version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, LATEST_VERSION);
}

#[test]
fn test_pre_migration_database_upgrades() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();

    // Simulate a pre-migration database: create skills table without newer columns
    conn.execute_batch(
        "
            CREATE TABLE skills (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                source_type TEXT NOT NULL,
                source_ref TEXT,
                source_revision TEXT,
                central_path TEXT NOT NULL UNIQUE,
                content_hash TEXT,
                enabled INTEGER DEFAULT 1,
                created_at INTEGER,
                updated_at INTEGER,
                status TEXT DEFAULT 'ok'
            );
            CREATE TABLE scenarios (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                sort_order INTEGER DEFAULT 0,
                created_at INTEGER,
                updated_at INTEGER
            );
            ",
    )
    .unwrap();

    // user_version is 0 (default), so migration should run
    run_migrations(&conn).unwrap();

    // Verify new columns were added
    assert!(has_column(&conn, "skills", "source_ref_resolved").unwrap());
    assert!(has_column(&conn, "skills", "source_subpath").unwrap());
    assert!(has_column(&conn, "skills", "source_branch").unwrap());
    assert!(has_column(&conn, "skills", "remote_revision").unwrap());
    assert!(has_column(&conn, "skills", "update_status").unwrap());
    assert!(has_column(&conn, "skills", "last_checked_at").unwrap());
    assert!(has_column(&conn, "skills", "last_check_error").unwrap());
    assert!(has_column(&conn, "scenarios", "icon").unwrap());

    let version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, LATEST_VERSION);
}

#[test]
fn test_v1_database_upgrades_to_v2() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();

    conn.execute_batch(
        "
            CREATE TABLE skills (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                source_type TEXT NOT NULL,
                source_ref TEXT,
                source_ref_resolved TEXT,
                source_subpath TEXT,
                source_branch TEXT,
                source_revision TEXT,
                remote_revision TEXT,
                central_path TEXT NOT NULL UNIQUE,
                content_hash TEXT,
                enabled INTEGER DEFAULT 1,
                created_at INTEGER,
                updated_at INTEGER,
                status TEXT DEFAULT 'ok',
                update_status TEXT DEFAULT 'unknown',
                last_checked_at INTEGER,
                last_check_error TEXT
            );
            CREATE TABLE scenarios (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                icon TEXT,
                sort_order INTEGER DEFAULT 0,
                created_at INTEGER,
                updated_at INTEGER
            );
            CREATE TABLE scenario_skills (
                scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
                skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
                added_at INTEGER,
                PRIMARY KEY(scenario_id, skill_id)
            );
            CREATE TABLE skill_targets (
                id TEXT PRIMARY KEY,
                skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
                tool TEXT NOT NULL,
                target_path TEXT NOT NULL,
                mode TEXT NOT NULL,
                status TEXT DEFAULT 'ok',
                synced_at INTEGER,
                last_error TEXT,
                UNIQUE(skill_id, tool)
            );
            PRAGMA user_version = 1;
            ",
    )
    .unwrap();

    run_migrations(&conn).unwrap();
    assert!(has_column(&conn, "scenario_skill_tools", "enabled").unwrap());
    assert!(has_column(&conn, "skill_targets", "source_hash").unwrap());

    let version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, LATEST_VERSION);
}

#[test]
fn orphaned_default_export_agents_setting_is_dropped() {
    let conn = Connection::open_in_memory().unwrap();
    // Arrive at v7 the way a real upgrading database does, then plant the
    // row that the removed UI used to write.
    conn.pragma_update(None, "user_version", 0).unwrap();
    run_migrations(&conn).unwrap();
    conn.pragma_update(None, "user_version", 7).unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('project_default_export_agents', ?1)",
        ["[\"claude_code\",\"codex\"]"],
    )
    .unwrap();
    assert_eq!(
        count_setting(&conn),
        1,
        "precondition: the row must exist, or this test proves nothing"
    );

    run_migrations(&conn).unwrap();

    assert_eq!(
        count_setting(&conn),
        0,
        "v7→v8 must delete the orphaned preference"
    );
    // Unrelated settings must survive.
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', 'dark')",
        [],
    )
    .unwrap();
    run_migrations(&conn).unwrap();
    let theme: String = conn
        .query_row("SELECT value FROM settings WHERE key = 'theme'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(theme, "dark");
}

fn count_setting(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM settings WHERE key = 'project_default_export_agents'",
        [],
        |r| r.get(0),
    )
    .unwrap()
}

#[test]
fn test_newer_schema_rejected() {
    let conn = Connection::open_in_memory().unwrap();
    conn.pragma_update(None, "user_version", LATEST_VERSION + 1)
        .unwrap();

    let err = run_migrations(&conn).unwrap_err();
    let msg = err.to_string();
    assert!(
        msg.contains("newer than this app supports"),
        "unexpected error: {msg}"
    );
}
