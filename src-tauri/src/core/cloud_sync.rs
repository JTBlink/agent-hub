//! Optional backup integration for local mutations; absent builds perform no backup I/O.
pub(crate) fn notify_central_change() {
    #[cfg(feature = "cloud-sync")]
    super::auto_backup::notify_central_change();
}

pub(crate) fn recover_for_user_config() -> anyhow::Result<()> {
    #[cfg(feature = "cloud-sync")]
    super::backup_workspace::recover_for_user_config()?;
    Ok(())
}
