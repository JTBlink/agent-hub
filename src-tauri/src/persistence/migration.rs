use rusqlite::Connection;

use super::PersistenceError;

#[derive(Debug, Clone, Copy)]
struct Migration {
    version: i64,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        sql: include_str!("../../migrations/0001_initial.sql"),
    },
    Migration {
        version: 2,
        sql: include_str!("../../migrations/0002_config_history_snapshot.sql"),
    },
];

pub(super) fn run_migrations(connection: &mut Connection) -> Result<(), PersistenceError> {
    apply_migrations(connection, MIGRATIONS)
}

fn apply_migrations(
    connection: &mut Connection,
    migrations: &[Migration],
) -> Result<(), PersistenceError> {
    if migrations
        .windows(2)
        .any(|pair| pair[0].version >= pair[1].version)
        || migrations.iter().any(|migration| migration.version <= 0)
    {
        return Err(PersistenceError::InvalidInput(
            "migration versions must be positive, unique, and strictly increasing".into(),
        ));
    }

    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    )?;

    let mut statement = connection.prepare("SELECT version FROM schema_migrations")?;
    let applied = statement
        .query_map([], |row| row.get::<_, i64>(0))?
        .collect::<Result<std::collections::HashSet<_>, _>>()?;
    drop(statement);

    if let Some(unknown) = applied.iter().find(|version| {
        !migrations
            .iter()
            .any(|migration| migration.version == **version)
    }) {
        return Err(PersistenceError::InvalidInput(format!(
            "database contains unknown migration version {unknown}"
        )));
    }

    for migration in migrations {
        if applied.contains(&migration.version) {
            continue;
        }
        let transaction = connection.transaction()?;
        transaction.execute_batch(migration.sql)?;
        transaction.execute(
            "INSERT INTO schema_migrations (version) VALUES (?1)",
            [migration.version],
        )?;
        transaction.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_MIGRATIONS: &[Migration] = &[
        Migration {
            version: 1,
            sql: "CREATE TABLE example (id INTEGER PRIMARY KEY);",
        },
        Migration {
            version: 2,
            sql: "ALTER TABLE example ADD COLUMN name TEXT;",
        },
    ];

    #[test]
    fn applies_all_pending_migrations_once_in_version_order() {
        let mut connection = Connection::open_in_memory().expect("database opens");

        apply_migrations(&mut connection, TEST_MIGRATIONS).expect("migrations apply");
        apply_migrations(&mut connection, TEST_MIGRATIONS).expect("migrations are idempotent");

        let applied = connection
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("migration count loads");
        let has_name = connection
            .prepare("SELECT name FROM example")
            .expect("second migration added the column")
            .column_count();
        assert_eq!(applied, 2);
        assert_eq!(has_name, 1);
    }

    #[test]
    fn rejects_unknown_or_out_of_order_migration_versions() {
        let mut connection = Connection::open_in_memory().expect("database opens");
        let invalid = [TEST_MIGRATIONS[1], TEST_MIGRATIONS[0]];
        assert!(matches!(
            apply_migrations(&mut connection, &invalid),
            Err(PersistenceError::InvalidInput(_))
        ));

        connection
            .execute_batch(
                "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO schema_migrations (version) VALUES (99);",
            )
            .expect("future schema is created");
        assert!(matches!(
            apply_migrations(&mut connection, TEST_MIGRATIONS),
            Err(PersistenceError::InvalidInput(_))
        ));
    }
}
