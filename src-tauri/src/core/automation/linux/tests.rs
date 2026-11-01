use super::*;
#[test]
fn marks_packaged_system_timers_and_keeps_local_and_user_timers() {
    let text = "Id=cleanup.timer\nFragmentPath=/usr/lib/systemd/system/cleanup.timer\n\nId=audit.timer\nFragmentPath=/etc/systemd/system/audit.timer\n\nId=temporary.timer\nFragmentPath=/run/systemd/transient/temporary.timer\n";
    assert_eq!(
        parse(text, "system")
            .iter()
            .map(|t| t.is_builtin)
            .collect::<Vec<_>>(),
        vec![true, false, false]
    );
    assert!(parse(text, "user").iter().all(|t| !t.is_builtin));
}
#[test]
fn reads_timer_properties_without_claiming_trigger_means_success() {
    let text = "Id=audit.timer\nDescription=Daily audit\nActiveState=active\nTimersCalendar={ OnCalendar=*-*-* 09:00:00 ; next_elapse=n/a }\nNextElapseUSecRealtime=Tue 2026-10-27 09:00:00 UTC\nLastTriggerUSec=Mon 2026-10-26 09:00:00 UTC\n\nId=cleanup.timer\nActiveState=inactive\nNextElapseUSecRealtime=n/a\n";
    let tasks = parse(text, "user");
    assert_eq!(tasks.len(), 2);
    assert_eq!(tasks[0].status, "active");
    assert!(tasks[0].last_result.is_none());
    assert_eq!(tasks[1].status, "paused");
    assert!(tasks[1].next_run.is_none());
    assert_ne!(tasks[0].id, parse(text, "system")[0].id);
}
