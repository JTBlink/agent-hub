use super::*;

#[test]
fn collapses_repeated_tray_lines_old_format() {
    let log = "\
[2026-03-22][04:20:02][app_lib][INFO] Tray icon created
[2026-03-22][04:21:02][app_lib][INFO] Tray icon created
[2026-03-22][04:22:02][app_lib][INFO] Tray icon created
[2026-03-22][04:23:02][app_lib][INFO] Tray icon created
[2026-03-22][04:24:02][app_lib][INFO] Migrated legacy tool key X -> Y";
    let out = collapse_consecutive_repeats(log);
    assert!(out.contains("repeated 3 more times"), "got: {out}");
    assert!(out.contains("Migrated legacy tool key X -> Y"));
    assert_eq!(out.lines().count(), 3);
}

#[test]
fn keeps_distinct_lines() {
    let log = "\
2026-05-17T17:56:13 INFO  [app_lib] app start
2026-05-17T17:56:14 ERROR [app_lib] something failed
2026-05-17T17:56:15 INFO  [app_lib] scan complete";
    let out = collapse_consecutive_repeats(log);
    assert_eq!(out.lines().count(), 3);
    assert!(out.contains("app start"));
    assert!(out.contains("something failed"));
}

#[test]
fn pair_repeat_kept_as_is() {
    let log = "a INFO  [m] foo\nb INFO  [m] foo\nc INFO  [m] bar";
    let out = collapse_consecutive_repeats(log);
    assert_eq!(out.lines().count(), 3);
    assert!(!out.contains("repeated"));
}
