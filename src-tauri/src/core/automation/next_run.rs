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
mod tests;
