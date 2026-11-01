use super::*;

#[test]
fn marks_standard_system_maintenance_without_hiding_custom_crontabs() {
    assert!(
        parse(
            "0 0 * * * root run-parts /etc/cron.daily",
            "/etc/crontab",
            true
        )[0]
        .is_builtin
    );
    assert!(
        parse(
            "0 0 * * * root /bin/maintenance",
            "/etc/cron.d/e2scrub_all",
            true
        )[0]
        .is_builtin
    );
    assert!(
        !parse(
            "0 0 * * * root /bin/backup",
            "/etc/cron.d/custom-backup",
            true
        )[0]
        .is_builtin
    );
    assert!(!parse("0 0 * * * /bin/maintenance", "crontab", false)[0].is_builtin);
}

#[test]
fn reads_user_and_system_crontabs_without_mistaking_environment_for_tasks() {
    let tasks = parse("# comment\nSHELL=/bin/sh\nMAILTO = user@example.invalid\n0 9 * * 1-5 echo key=value\n@reboot /bin/start\n", "crontab", false);
    assert_eq!(tasks.len(), 2);
    assert_eq!(tasks[0].schedule, "0 9 * * 1-5");
    assert_eq!(tasks[0].command.as_deref(), Some("echo key=value"));
    assert!(tasks[0].next_run.is_none());
    assert_eq!(tasks[0].status, "unknown");
    let tasks = parse("0 0 * * * root /bin/backup\n", "/etc/crontab", true);
    assert_eq!(tasks[0].command.as_deref(), Some("/bin/backup"));
    assert_eq!(
        parse("0 9 * * * echo 'two  spaces'", "crontab", false)[0]
            .command
            .as_deref(),
        Some("echo 'two  spaces'")
    );
    assert!(cron_file_name("daily-backup"));
    assert!(!cron_file_name("daily-backup.bak"));
    assert!(!cron_file_name(".placeholder"));
}
