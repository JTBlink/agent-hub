CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY,
    display_name TEXT NOT NULL,
    entered_path TEXT NOT NULL,
    normalized_path TEXT NOT NULL UNIQUE,
    canonical_path TEXT UNIQUE,
    path_status TEXT NOT NULL DEFAULT 'verified' CHECK (path_status IN ('verified', 'unverified')),
    last_scanned_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_files (
    id INTEGER PRIMARY KEY,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    agent TEXT NOT NULL CHECK (agent IN ('claude-code', 'codex', 'opencode')),
    scope TEXT NOT NULL CHECK (scope IN ('global', 'workspace')),
    normalized_path TEXT NOT NULL,
    format TEXT NOT NULL,
    checksum TEXT NOT NULL,
    byte_size INTEGER NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
    modified_at TEXT,
    parse_status TEXT NOT NULL,
    diagnostic_code TEXT,
    CHECK ((scope = 'global' AND workspace_id IS NULL) OR (scope = 'workspace' AND workspace_id IS NOT NULL)),
    UNIQUE (workspace_id, agent, scope, normalized_path)
);

CREATE TABLE IF NOT EXISTS config_backups (
    id INTEGER PRIMARY KEY,
    config_file_id INTEGER REFERENCES config_files(id) ON DELETE SET NULL,
    backup_path TEXT NOT NULL,
    original_checksum TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_operations (
    id INTEGER PRIMARY KEY,
    config_file_id INTEGER REFERENCES config_files(id) ON DELETE SET NULL,
    operation_type TEXT NOT NULL,
    before_checksum TEXT,
    after_checksum TEXT,
    backup_id INTEGER REFERENCES config_backups(id) ON DELETE SET NULL,
    result TEXT NOT NULL,
    diagnostic_code TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skill_sources (
    id INTEGER PRIMARY KEY,
    source_type TEXT NOT NULL,
    canonical_locator TEXT NOT NULL,
    manifest_path TEXT,
    requested_ref TEXT,
    resolved_commit TEXT,
    source_fingerprint TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source_type, canonical_locator, requested_ref)
);

CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY,
    source_id INTEGER NOT NULL REFERENCES skill_sources(id) ON DELETE CASCADE,
    skill_key TEXT NOT NULL UNIQUE,
    relative_path TEXT NOT NULL,
    entrypoint_path TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('standard', 'plugin-skill')),
    content_fingerprint TEXT,
    compatibility_json TEXT NOT NULL DEFAULT '{}',
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS skill_installations (
    id INTEGER PRIMARY KEY,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    agent TEXT NOT NULL CHECK (agent IN ('claude-code', 'codex', 'opencode')),
    scope TEXT NOT NULL CHECK (scope IN ('global', 'workspace')),
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    target_path TEXT NOT NULL,
    installed_revision TEXT,
    installed_fingerprint TEXT,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    state TEXT NOT NULL DEFAULT 'installed',
    managed_files_json TEXT NOT NULL DEFAULT '[]',
    CHECK ((scope = 'global' AND workspace_id IS NULL) OR (scope = 'workspace' AND workspace_id IS NOT NULL)),
    UNIQUE (skill_id, agent, scope, workspace_id, target_path)
);

CREATE TABLE IF NOT EXISTS install_plans (
    id INTEGER PRIMARY KEY,
    source_revision TEXT,
    state TEXT NOT NULL CHECK (state IN ('draft', 'confirmed', 'applied', 'failed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_at TEXT
);

CREATE TABLE IF NOT EXISTS install_plan_actions (
    id INTEGER PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES install_plans(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (action_type IN ('install', 'update', 'enable', 'disable', 'remove')),
    agent TEXT NOT NULL CHECK (agent IN ('claude-code', 'codex', 'opencode')),
    scope TEXT NOT NULL CHECK (scope IN ('global', 'workspace')),
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    target_path TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    expected_checksum TEXT,
    CHECK ((scope = 'global' AND workspace_id IS NULL) OR (scope = 'workspace' AND workspace_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY CHECK (key IN ('theme', 'backupRetentionDays', 'lastLocalSkillSource')),
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_config_files_path ON config_files(normalized_path);
CREATE INDEX IF NOT EXISTS idx_skill_installations_target ON skill_installations(target_path);
CREATE INDEX IF NOT EXISTS idx_config_operations_created ON config_operations(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_global_config_file ON config_files(agent, scope, normalized_path) WHERE workspace_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_global_skill_installation ON skill_installations(skill_id, agent, scope, target_path) WHERE workspace_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_skill_source_identity ON skill_sources(source_type, canonical_locator, COALESCE(requested_ref, ''));
