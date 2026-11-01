use super::skip_check_mode;
use super::sync_engine::SyncMode;

#[test]
fn matching_modes_are_compatible() {
    assert!(matches!(
        skip_check_mode("symlink", SyncMode::Symlink),
        Some(SyncMode::Symlink)
    ));
    assert!(matches!(
        skip_check_mode("copy", SyncMode::Copy),
        Some(SyncMode::Copy)
    ));
}

#[test]
fn copy_existing_with_symlink_desired_treated_as_copy() {
    // Windows fallback case (issue #153): record says copy because
    // symlink_dir failed previously. We accept that and let the hash
    // gate decide freshness, instead of re-attempting symlink and
    // triggering a full recopy on every startup.
    assert!(matches!(
        skip_check_mode("copy", SyncMode::Symlink),
        Some(SyncMode::Copy)
    ));
}

#[test]
fn symlink_existing_with_copy_desired_is_incompatible() {
    // User flipped sync_mode setting from symlink to copy — the
    // on-disk symlink no longer reflects intent, must resync.
    assert!(skip_check_mode("symlink", SyncMode::Copy).is_none());
}

#[test]
fn unknown_existing_mode_is_incompatible() {
    assert!(skip_check_mode("garbage", SyncMode::Symlink).is_none());
    assert!(skip_check_mode("", SyncMode::Copy).is_none());
}
