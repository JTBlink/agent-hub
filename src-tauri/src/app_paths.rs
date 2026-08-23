use std::{
    fs, io,
    path::{Path, PathBuf},
};

const DATA_DIRECTORY_NAME: &str = ".agenthub";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppPaths {
    pub root: PathBuf,
    pub database: PathBuf,
    pub backups: PathBuf,
    pub skill_sources: PathBuf,
    pub logs: PathBuf,
}

impl AppPaths {
    pub fn from_home(home: impl AsRef<Path>) -> Self {
        let root = home.as_ref().join(DATA_DIRECTORY_NAME);
        Self {
            database: root.join("agent-hub.sqlite3"),
            backups: root.join("backups"),
            skill_sources: root.join("skill-sources"),
            logs: root.join("logs"),
            root,
        }
    }

    /// Move the previous Tauri data directory as one unit when the new root
    /// has not been created yet. Moving the complete directory keeps SQLite
    /// WAL files, backups, and source caches on the same revision.
    pub fn prepare(&self, legacy_root: impl AsRef<Path>) -> io::Result<MigrationOutcome> {
        let legacy_root = legacy_root.as_ref();
        if legacy_root == self.root {
            fs::create_dir_all(&self.root)?;
            set_private_directory(&self.root)?;
            return Ok(MigrationOutcome::NotNeeded);
        }
        let outcome = if !self.root.exists() && legacy_root.is_dir() {
            match fs::rename(legacy_root, &self.root) {
                Ok(()) => MigrationOutcome::MovedLegacyData,
                Err(error) if error.kind() == io::ErrorKind::CrossesDevices => {
                    copy_directory(legacy_root, &self.root)?;
                    fs::remove_dir_all(legacy_root)?;
                    MigrationOutcome::CopiedLegacyData
                }
                Err(error) => return Err(error),
            }
        } else if !self.database.exists() && legacy_root.is_dir() {
            // The log plugin may have already created ~/.agenthub/logs before
            // application setup. Merge the legacy entries without replacing
            // anything already present in the new root.
            fs::create_dir_all(&self.root)?;
            move_directory_contents(legacy_root, &self.root)?;
            MigrationOutcome::MovedLegacyData
        } else {
            fs::create_dir_all(&self.root)?;
            MigrationOutcome::NotNeeded
        };
        set_private_directory(&self.root)?;
        Ok(outcome)
    }
}

fn move_directory_contents(source: &Path, destination: &Path) -> io::Result<()> {
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if destination_path.exists() {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                format!(
                    "new AgentHub data already exists and was not overwritten: {}",
                    destination_path.display()
                ),
            ));
        }
        match fs::rename(&source_path, &destination_path) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::CrossesDevices => {
                let metadata = fs::symlink_metadata(&source_path)?;
                if metadata.is_dir() {
                    copy_directory(&source_path, &destination_path)?;
                    fs::remove_dir_all(&source_path)?;
                } else if metadata.is_file() {
                    fs::copy(&source_path, &destination_path)?;
                    fs::remove_file(&source_path)?;
                } else {
                    return Err(error);
                }
            }
            Err(error) => return Err(error),
        }
    }
    fs::remove_dir(source)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MigrationOutcome {
    NotNeeded,
    MovedLegacyData,
    CopiedLegacyData,
}

fn copy_directory(source: &Path, destination: &Path) -> io::Result<()> {
    fs::create_dir(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let metadata = fs::symlink_metadata(&source_path)?;
        if metadata.file_type().is_symlink() {
            return Err(io::Error::other(format!(
                "legacy data contains an unsupported symbolic link: {}",
                source_path.display()
            )));
        }
        if metadata.is_dir() {
            copy_directory(&source_path, &destination_path)?;
        } else if metadata.is_file() {
            fs::copy(&source_path, &destination_path)?;
        }
    }
    Ok(())
}

#[cfg(unix)]
fn set_private_directory(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn set_private_directory(_path: &Path) -> io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_all_agenthub_owned_data_under_one_home_directory() {
        let paths = AppPaths::from_home("~");

        assert_eq!(paths.root, PathBuf::from("~/.agenthub"));
        assert_eq!(
            paths.database,
            PathBuf::from("~/.agenthub/agent-hub.sqlite3")
        );
        assert!(paths.backups.starts_with(&paths.root));
        assert!(paths.skill_sources.starts_with(&paths.root));
        assert!(paths.logs.starts_with(&paths.root));
    }

    #[test]
    fn moves_the_complete_legacy_directory_without_overwriting_a_new_root() {
        let home = tempfile::tempdir().expect("home");
        let legacy = home.path().join("legacy-app-data");
        fs::create_dir_all(legacy.join("backups")).expect("legacy backups");
        fs::write(legacy.join("agent-hub.sqlite3"), b"database").expect("legacy database");
        fs::write(legacy.join("backups/example"), b"backup").expect("legacy backup");
        let paths = AppPaths::from_home(home.path());

        assert_eq!(
            paths.prepare(&legacy).expect("migration"),
            MigrationOutcome::MovedLegacyData
        );
        assert_eq!(fs::read(&paths.database).expect("database"), b"database");
        assert_eq!(
            fs::read(paths.backups.join("example")).expect("backup"),
            b"backup"
        );
        assert!(!legacy.exists());

        fs::create_dir_all(&legacy).expect("recreated legacy directory");
        fs::write(legacy.join("agent-hub.sqlite3"), b"stale").expect("stale database");
        assert_eq!(
            paths.prepare(&legacy).expect("second preparation"),
            MigrationOutcome::NotNeeded
        );
        assert_eq!(fs::read(&paths.database).expect("database"), b"database");
    }
}
