//! Calendar predictions for launchd, which does not expose a next-fire timestamp.
//! Native timestamps from other schedulers remain authoritative.
use super::{AutomationOverview, Schedule};
use chrono::{DateTime, Datelike, Duration, TimeZone, Timelike, Utc};

fn calendar<Tz: TimeZone>(schedule: &Schedule, now: &DateTime<Tz>) -> Option<DateTime<Tz>> {
    if schedule.validate().is_err()
        || !matches!(schedule, Schedule::Hourly { .. } | Schedule::Daily { .. })
    {
        return None;
    }
    // Walk real instants rather than constructing local wall-clock times: missing
    // and repeated minutes during offset changes are then handled by the timezone.
    let minute = now
        .timestamp()
        .div_euclid(60)
        .checked_add(1)?
        .checked_mul(60)?;
    let mut candidate = DateTime::<Utc>::from_timestamp(minute, 0)?;
    let zone = now.timezone();
    for _ in 0..8 * 24 * 60 {
        let local = candidate.with_timezone(&zone);
        let matches = match schedule {
            Schedule::Hourly { minute } => local.minute() == u32::from(*minute),
            Schedule::Daily {
                hour,
                minute,
                weekdays,
            } => {
                local.hour() == u32::from(*hour)
                    && local.minute() == u32::from(*minute)
                    && (!weekdays || local.weekday().num_days_from_monday() < 5)
            }
            _ => false,
        };
        if matches {
            return Some(local);
        }
        candidate = candidate.checked_add_signed(Duration::minutes(1))?;
    }
    None
}

pub(super) fn fill<Tz: TimeZone>(report: &mut AutomationOverview, now: &DateTime<Tz>) {
    for task in &mut report.tasks {
        if task.source != "launchd" {
            continue;
        }
        let Some(draft) = &task.definition else {
            continue;
        };
        if !draft.enabled
            || matches!(draft.schedule, Schedule::Manual)
            || task
                .installation
                .as_deref()
                .is_some_and(|state| state != "installed")
            || !matches!(task.status.as_str(), "active" | "running" | "error")
        {
            task.next_run = None;
        } else if task.next_run.is_none() {
            task.next_run = calendar(&draft.schedule, now).map(|date| date.to_rfc3339());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::automation::{AutomationDraft, AutomationTask};
    use chrono::FixedOffset;
    fn time(value: &str) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339(value).unwrap()
    }
    #[test]
    fn hourly_uses_the_next_matching_minute_and_rolls_over_at_the_exact_boundary() {
        let schedule = Schedule::Hourly { minute: 30 };
        for (now, expected) in [
            ("2026-10-31T12:10:12+08:00", "2026-10-31T12:30:00+08:00"),
            ("2026-10-31T12:29:59.999+08:00", "2026-10-31T12:30:00+08:00"),
            ("2026-10-31T12:30:00+08:00", "2026-10-31T13:30:00+08:00"),
            ("2026-12-31T23:50:00-05:00", "2027-01-01T00:30:00-05:00"),
        ] {
            assert_eq!(calendar(&schedule, &time(now)), Some(time(expected)));
        }
    }
    #[test]
    fn daily_and_workdays_follow_local_time_and_skip_weekends() {
        for (now, weekdays, expected) in [
            (
                "2026-10-30T06:00:00+08:00",
                false,
                "2026-10-30T07:00:00+08:00",
            ),
            (
                "2026-10-30T07:00:00+08:00",
                false,
                "2026-10-31T07:00:00+08:00",
            ),
            (
                "2026-10-30T07:00:00+08:00",
                true,
                "2026-11-02T07:00:00+08:00",
            ),
            (
                "2026-10-31T06:00:00+08:00",
                true,
                "2026-11-02T07:00:00+08:00",
            ),
        ] {
            assert_eq!(
                calendar(
                    &Schedule::Daily {
                        hour: 7,
                        minute: 0,
                        weekdays
                    },
                    &time(now)
                ),
                Some(time(expected))
            );
        }
        for schedule in [
            Schedule::Manual,
            Schedule::Interval { minutes: 10 },
            Schedule::Custom {
                expression: "*/10 * * * *".into(),
            },
            Schedule::Hourly { minute: 60 },
        ] {
            assert!(calendar(&schedule, &time("2026-10-31T06:00:00+08:00")).is_none());
        }
    }
    fn task() -> AutomationTask {
        let mut task = AutomationTask::new(
            "example".into(),
            "MR processing".into(),
            "launchd",
            "example.plist".into(),
        );
        task.status = "active".into();
        task.installation = Some("installed".into());
        task.definition = Some(AutomationDraft {
            name: task.name.clone(),
            provider: super::super::Provider::System,
            content: "pwd".into(),
            workdir: None,
            script_dir: None,
            files: vec![],
            package_options: None,
            schedule: Schedule::Hourly { minute: 30 },
            enabled: true,
        });
        task
    }
    #[test]
    fn enabling_and_rescheduling_update_the_prediction_while_pause_and_uninstall_clear_it() {
        let mut report = AutomationOverview {
            tasks: vec![task()],
            ..Default::default()
        };
        let now = time("2026-10-31T12:10:00+08:00");
        report.tasks[0].definition.as_mut().unwrap().enabled = false;
        fill(&mut report, &now);
        assert!(report.tasks[0].next_run.is_none());
        report.tasks[0].definition.as_mut().unwrap().enabled = true;
        fill(&mut report, &now);
        assert_eq!(
            report.tasks[0].next_run.as_deref(),
            Some("2026-10-31T12:30:00+08:00")
        );
        report.tasks[0].next_run = None;
        report.tasks[0].definition.as_mut().unwrap().schedule = Schedule::Hourly { minute: 45 };
        fill(&mut report, &now);
        assert_eq!(
            report.tasks[0].next_run.as_deref(),
            Some("2026-10-31T12:45:00+08:00")
        );
        report.tasks[0].installation = Some("uninstalled".into());
        fill(&mut report, &now);
        assert!(report.tasks[0].next_run.is_none());
        report.tasks[0].installation = Some("installed".into());
        report.tasks[0].status = "paused".into();
        fill(&mut report, &now);
        assert!(report.tasks[0].next_run.is_none());
    }
    #[test]
    fn retains_native_provider_timestamps_and_does_not_predict_unknown_registration_or_interval_phase(
    ) {
        let mut task = task();
        task.next_run = Some("2026-11-01T09:00:00Z".into());
        let mut report = AutomationOverview {
            tasks: vec![task],
            ..Default::default()
        };
        let now = time("2026-10-31T12:10:00+08:00");
        fill(&mut report, &now);
        assert_eq!(
            report.tasks[0].next_run.as_deref(),
            Some("2026-11-01T09:00:00Z")
        );
        report.tasks[0].status = "unknown".into();
        fill(&mut report, &now);
        assert!(report.tasks[0].next_run.is_none());
        report.tasks[0].status = "active".into();
        report.tasks[0].definition.as_mut().unwrap().schedule = Schedule::Interval { minutes: 10 };
        fill(&mut report, &now);
        assert!(report.tasks[0].next_run.is_none());
        report.tasks[0].source = "hermes".into();
        report.tasks[0].next_run = Some("2026-11-01T09:00:00Z".into());
        fill(&mut report, &now);
        assert_eq!(
            report.tasks[0].next_run.as_deref(),
            Some("2026-11-01T09:00:00Z")
        );
    }
}
