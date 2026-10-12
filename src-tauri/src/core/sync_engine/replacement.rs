//! Prepare replacements before moving existing deployment contents aside.
use super::{
    authorize_replacement, classify_target, copy_dir_recursive, ReplacePolicy, SyncMode,
    TargetState,
};
use anyhow::{bail, Context, Result};
use std::{fs, path::Path};

pub(super) fn replace(
    source: &Path,
    target: &Path,
    mode: SyncMode,
    policy: ReplacePolicy<'_>,
    expected: TargetState,
) -> Result<SyncMode> {
    let parent = target.parent().context("Deployment target has no parent")?;
    let staging = tempfile::Builder::new()
        .prefix(".agent-hub-replacement-")
        .tempdir_in(parent)?;
    let prepared = staging.path().join("new");
    let actual_mode = prepare(source, &prepared, mode)?;
    if authorize_replacement(source, target, policy)? != expected {
        bail!("Deployment target changed during preparation; existing content was preserved");
    }
    let backup = staging.path().join("old");
    if expected != TargetState::Absent {
        fs::rename(target, &backup).context("Unable to retain the previous deployment")?;
    }
    let publication = (|| {
        if expected != TargetState::Absent {
            let retained = classify_target(&backup, None)?;
            let expected_type = match expected {
                TargetState::LinkToSource => TargetState::ForeignLink,
                state => state,
            };
            if retained != expected_type {
                bail!("Deployment target changed before replacement; preserving the new contents");
            }
        }
        publish(&prepared, target)
    })();
    if let Err(error) = publication {
        if expected != TargetState::Absent {
            if let Err(recovery_error) = fs::rename(&backup, target) {
                let retained = staging.keep();
                bail!(
                    "Replacement failed ({error}); recovery failed ({recovery_error}). \
                     Original contents were retained at {:?}",
                    retained.join("old")
                );
            }
        }
        return Err(error.context("Replacement failed; the previous deployment was restored"));
    }
    Ok(actual_mode)
}

fn prepare(source: &Path, prepared: &Path, mode: SyncMode) -> Result<SyncMode> {
    match mode {
        SyncMode::Copy => {
            copy_dir_recursive(source, prepared)?;
            Ok(SyncMode::Copy)
        }
        SyncMode::Symlink => {
            #[cfg(unix)]
            {
                std::os::unix::fs::symlink(source, prepared)
                    .context("Unable to prepare the replacement link")?;
                Ok(SyncMode::Symlink)
            }
            #[cfg(windows)]
            {
                match std::os::windows::fs::symlink_dir(source, prepared) {
                    Ok(()) => Ok(SyncMode::Symlink),
                    Err(error) => match junction::create(source, prepared) {
                        Ok(()) => Ok(SyncMode::Symlink),
                        Err(junction_error) => {
                            log::warn!(
                                "Unable to prepare deployment link ({error}) or junction \
                                 ({junction_error}); preparing a copy"
                            );
                            copy_dir_recursive(source, prepared)?;
                            Ok(SyncMode::Copy)
                        }
                    },
                }
            }
            #[cfg(all(not(unix), not(windows)))]
            {
                copy_dir_recursive(source, prepared)?;
                Ok(SyncMode::Copy)
            }
        }
    }
}

#[cfg(test)]
thread_local! {
    pub(super) static FAIL_PUBLICATION: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

fn publish(prepared: &Path, target: &Path) -> Result<()> {
    #[cfg(test)]
    if FAIL_PUBLICATION.with(|value| value.get()) {
        bail!("Injected deployment publication failure");
    }
    if classify_target(target, None)? != TargetState::Absent {
        bail!("Deployment target appeared during publication; refusing to overwrite it");
    }
    fs::rename(prepared, target).context("Unable to publish the prepared deployment")
}
