//! User-requested local credential storage, separate from portable backups.
use super::{central_repo, git_credentials::RemoteCredential};
use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

fn directory() -> PathBuf {
    central_repo::base_dir().join("credentials")
}
fn path(host: &str) -> PathBuf {
    directory().join(format!(
        "git-{:x}.json",
        Sha256::digest(host.to_ascii_lowercase().as_bytes())
    ))
}

fn validate(path: &Path) -> Result<()> {
    match path.symlink_metadata() {
        Ok(meta) if meta.file_type().is_symlink() => {
            bail!("Credential storage must not be a symbolic link")
        }
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

/// Outer None means never migrated. Inner None is a persistent logout marker:
/// an older keychain credential must not silently sign a user back in.
pub(super) fn read(host: &str) -> Result<Option<Option<RemoteCredential>>> {
    validate(&directory())?;
    let path = path(host);
    validate(&path)?;
    match fs::read(&path) {
        Ok(bytes) => {
            restrict(&directory(), 0o700)?;
            restrict(&path, 0o600)?;
            Ok(Some(serde_json::from_slice(&bytes).context(
                "Local Git credential is corrupt; sign in again",
            )?))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e).context("Cannot read local Git credential"),
    }
}

pub(super) fn write(host: &str, value: Option<&RemoteCredential>) -> Result<()> {
    let dir = directory();
    validate(&dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(&dir)?;
    }
    #[cfg(not(unix))]
    fs::create_dir_all(&dir)?;
    restrict(&dir, 0o700)?;
    let dest = path(host);
    validate(&dest)?;
    let mut temp = tempfile::NamedTempFile::new_in(&dir)?;
    restrict(temp.path(), 0o600)?;
    temp.write_all(&serde_json::to_vec(&value)?)?;
    temp.as_file().sync_all()?;
    temp.persist(dest)
        .map_err(|e| e.error)
        .context("Cannot save local Git credential")?;
    Ok(())
}

#[cfg(unix)]
fn restrict(path: &Path, mode: u32) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode))?;
    Ok(())
}
#[cfg(not(unix))]
fn restrict(_path: &Path, _mode: u32) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persists_rotations_and_logout_across_cache_instances() {
        let _lock = central_repo::test_base_dir_lock();
        let temp = tempfile::tempdir().unwrap();
        central_repo::set_test_base_dir_override(Some(temp.path().join("app")));
        assert!(read("example.invalid").unwrap().is_none());
        for password in ["fixture-one", "fixture-two"] {
            let cred = RemoteCredential {
                username: "fixture".into(),
                password: password.into(),
            };
            write("EXAMPLE.INVALID", Some(&cred)).unwrap();
            assert_eq!(read("example.invalid").unwrap(), Some(Some(cred)));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(directory()).unwrap().permissions().mode() & 0o777,
                0o700
            );
            assert_eq!(
                fs::metadata(path("example.invalid"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        write("example.invalid", None).unwrap();
        assert_eq!(read("example.invalid").unwrap(), Some(None));
        central_repo::set_test_base_dir_override(None);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_linked_credential_directory_without_touching_target() {
        let _lock = central_repo::test_base_dir_lock();
        let temp = tempfile::tempdir().unwrap();
        central_repo::set_test_base_dir_override(Some(temp.path().to_owned()));
        let target = temp.path().join("outside");
        fs::create_dir(&target).unwrap();
        std::os::unix::fs::symlink(&target, directory()).unwrap();
        assert!(write("example.invalid", None).is_err());
        assert!(read("example.invalid").is_err());
        assert_eq!(fs::read_dir(target).unwrap().count(), 0);
        central_repo::set_test_base_dir_override(None);
    }
}
