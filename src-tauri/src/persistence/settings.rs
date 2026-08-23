use rusqlite::OptionalExtension;

use super::*;

impl SettingsRepository for Database {
    fn set_setting(&self, setting: AppSetting) -> Result<(), PersistenceError> {
        let (key, value) = match setting {
            AppSetting::Theme(theme) => (
                "theme",
                match theme {
                    Theme::System => "system".to_owned(),
                    Theme::Light => "light".to_owned(),
                    Theme::Dark => "dark".to_owned(),
                },
            ),
            AppSetting::BackupRetentionDays(days) if (1..=365).contains(&days) => {
                ("backupRetentionDays", days.to_string())
            }
            AppSetting::BackupRetentionDays(days) => {
                return Err(PersistenceError::InvalidInput(format!(
                    "backup retention days must be between 1 and 365, got {days}"
                )))
            }
            AppSetting::LastLocalSkillSource(path) if !path.trim().is_empty() => {
                ("lastLocalSkillSource", path.to_owned())
            }
            AppSetting::LastLocalSkillSource(_) => {
                return Err(PersistenceError::InvalidInput(
                    "last local Skill source cannot be empty".into(),
                ))
            }
        };
        let connection = self.lock_connection()?;
        connection.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
            rusqlite::params![key, value],
        )?;
        Ok(())
    }

    fn setting(&self, key: SettingKey) -> Result<Option<AppSetting>, PersistenceError> {
        let key_name = match key {
            SettingKey::Theme => "theme",
            SettingKey::BackupRetentionDays => "backupRetentionDays",
            SettingKey::LastLocalSkillSource => "lastLocalSkillSource",
        };
        let connection = self.lock_connection()?;
        let value: Option<String> = connection
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                [key_name],
                |row| row.get(0),
            )
            .optional()?;
        value.map(|value| parse_setting(key, &value)).transpose()
    }
}
