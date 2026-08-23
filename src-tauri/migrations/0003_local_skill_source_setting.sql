-- Rebuild the settings table so existing databases accept the persisted local
-- Skill source directory without changing any existing setting values.
CREATE TABLE settings_v3 (
    key TEXT PRIMARY KEY CHECK (key IN ('theme', 'backupRetentionDays', 'lastLocalSkillSource')),
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO settings_v3 (key, value, updated_at)
SELECT key, value, updated_at FROM settings;
DROP TABLE settings;
ALTER TABLE settings_v3 RENAME TO settings;
