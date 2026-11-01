//! Stage network clones before touching the live shared Skills tree. Keep the
//! complete pre-restore tree (including local Git history) as a recovery copy.
use super::*;
use std::fs;

#[cfg(test)]
fn reclone_from_remote_unlocked(root: &Path, url: &str) -> Result<()> {
    staged_clone(root, url)
}

pub(crate) fn clone_into_unlocked(root: &Path, url: &str) -> Result<()> {
    if root.join(".git").exists() {
        anyhow::bail!("Skills directory is already a git repository");
    }
    staged_clone(root, url)
}

fn clone_remote(root: &Path, url: &str) -> Result<()> {
    if git2_engine::applies_to(url) {
        return git2_engine::clone(url, root);
    }
    let env = git_credentials::credential_env_for_url(url);
    let output = git_command()
        .args(["-c", "init.defaultRefFormat=files", "clone", "--", url])
        .arg(root)
        .env_remove("GIT_DEFAULT_REF_FORMAT")
        .envs(env)
        .output()
        .context("Failed to spawn git clone")?;
    if !output.status.success() {
        anyhow::bail!(
            "git clone failed: {}",
            redact_urls_in_text(&String::from_utf8_lossy(&output.stderr))
        );
    }
    Ok(())
}

fn staged_clone(root: &Path, url: &str) -> Result<()> {
    if root.is_symlink() {
        anyhow::bail!("Cannot replace a linked Skills root; use its real directory");
    }
    let parent = root.parent().context("Skills root has no parent")?;
    fs::create_dir_all(parent)?;
    let stage = tempfile::Builder::new()
        .prefix(".agent-hub-clone-")
        .tempdir_in(parent)?;
    let checkout = stage.path().join("checkout");
    clone_remote(&checkout, url)?;
    let recovery_parent = if root == crate::core::central_repo::default_skills_dir() {
        crate::core::central_repo::home_base_dir().join("recovery")
    } else {
        parent.join(".agent-hub-recovery")
    };
    fs::create_dir_all(&recovery_parent)?;
    let recovery = recovery_parent.join(format!("skills-{}", uuid::Uuid::new_v4()));
    let had_local = root.symlink_metadata().is_ok();
    if had_local {
        fs::rename(root, &recovery).context("Cannot preserve the existing Skills directory")?;
    }
    let result = (|| {
        if had_local {
            merge_local(&recovery, &checkout)?;
        }
        if root.symlink_metadata().is_ok() {
            anyhow::bail!("Skills directory changed during restore");
        }
        fs::rename(&checkout, root).context("Cannot publish restored Skills")?;
        Ok(())
    })();
    if let Err(error) = result {
        if had_local && !root.exists() {
            fs::rename(&recovery, root).with_context(|| {
                format!(
                    "Restore failed ({error}); local contents are kept at {}",
                    crate::core::log_sanitize::sanitize(&recovery.to_string_lossy())
                )
            })?;
        }
        return Err(error);
    }
    if had_local {
        log::info!(
            "Pre-restore Skills and Git history retained at {}",
            crate::core::log_sanitize::sanitize(&recovery.to_string_lossy())
        );
    }
    Ok(())
}

/// Remote versions win name conflicts; the complete local originals remain in
/// recovery. Missing local entries, including links, are carried forward.
fn merge_local(source: &Path, target: &Path) -> Result<()> {
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        if entry.file_name() == ".git" {
            continue;
        }
        let destination = target.join(entry.file_name());
        if destination.symlink_metadata().is_ok() {
            continue;
        }
        copy_entry(&entry.path(), &destination)?;
    }
    Ok(())
}

fn copy_entry(source: &Path, target: &Path) -> Result<()> {
    let meta = source.symlink_metadata()?;
    if meta.file_type().is_symlink() {
        let link = fs::read_link(source)?;
        #[cfg(unix)]
        std::os::unix::fs::symlink(link, target)?;
        #[cfg(windows)]
        if source.is_dir() {
            std::os::windows::fs::symlink_dir(link, target)?;
        } else {
            std::os::windows::fs::symlink_file(link, target)?;
        }
    } else if meta.is_dir() {
        fs::create_dir(target)?;
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            copy_entry(&entry.path(), &target.join(entry.file_name()))?;
        }
    } else if meta.is_file() {
        fs::copy(source, target)?;
    } else {
        anyhow::bail!("Unsupported local entry during restore");
    }
    Ok(())
}

#[cfg(test)]
mod tests;
