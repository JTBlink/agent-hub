use rusqlite::Connection;

use super::*;

pub(super) fn validate_workspace(workspace: &NewWorkspace) -> Result<(), PersistenceError> {
    if workspace.display_name.trim().is_empty() {
        return Err(PersistenceError::InvalidInput(
            "workspace display name cannot be empty".into(),
        ));
    }
    if workspace.normalized_path.trim().is_empty() {
        return Err(PersistenceError::InvalidInput(
            "workspace normalized path cannot be empty".into(),
        ));
    }
    Ok(())
}

pub(super) fn validate_config_index(config: &ConfigIndex) -> Result<(), PersistenceError> {
    if config.scope != Scope::Workspace {
        return Err(PersistenceError::InvalidInput(
            "workspace scans only accept workspace-scoped configs".into(),
        ));
    }
    Ok(())
}

pub(super) fn parse_domain_value<T>(value: String, column: usize) -> rusqlite::Result<T>
where
    T: std::str::FromStr,
    T::Err: std::error::Error + Send + Sync + 'static,
{
    value.parse().map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            column,
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
}

pub(super) fn parse_setting(key: SettingKey, value: &str) -> Result<AppSetting, PersistenceError> {
    match key {
        SettingKey::Theme => match value {
            "system" => Ok(AppSetting::Theme(Theme::System)),
            "light" => Ok(AppSetting::Theme(Theme::Light)),
            "dark" => Ok(AppSetting::Theme(Theme::Dark)),
            other => Err(PersistenceError::InvalidInput(format!(
                "invalid stored theme: {other}"
            ))),
        },
        SettingKey::BackupRetentionDays => value
            .parse::<u16>()
            .map(AppSetting::BackupRetentionDays)
            .map_err(|_| {
                PersistenceError::InvalidInput(format!(
                    "invalid stored backup retention days: {value}"
                ))
            }),
        SettingKey::LastLocalSkillSource if !value.trim().is_empty() => {
            Ok(AppSetting::LastLocalSkillSource(value.to_owned()))
        }
        SettingKey::LastLocalSkillSource => Err(PersistenceError::InvalidInput(
            "stored last local Skill source cannot be empty".into(),
        )),
    }
}

pub(super) fn forbidden_schema_columns(
    connection: &Connection,
) -> Result<Vec<String>, PersistenceError> {
    const FORBIDDEN: &[&str] = &[
        "config_content",
        "content",
        "credential",
        "password",
        "raw_content",
        "secret",
        "token",
    ];
    let mut statement = connection.prepare(
        "SELECT schema.name, columns.name FROM sqlite_schema AS schema JOIN pragma_table_info(schema.name) AS columns WHERE schema.type = 'table' ORDER BY schema.name, columns.cid",
    )?;
    let columns = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut violations = Vec::new();
    for column in columns {
        let (table, name) = column?;
        if FORBIDDEN.contains(&name.to_ascii_lowercase().as_str()) {
            violations.push(format!("{table}.{name}"));
        }
    }
    Ok(violations)
}
