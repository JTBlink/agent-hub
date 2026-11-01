//! Local machine CPU and RAM sampling, shared across status-bar requests.
use serde::Serialize;
use std::time::{Duration, Instant};
use sysinfo::System;

// Only coalesce requests too close for the CPU counter; a full polling-period
// cache would skip alternate UI ticks because sampling itself takes time.
const INTERVAL: Duration = sysinfo::MINIMUM_CPU_UPDATE_INTERVAL;

#[derive(Clone, Debug, Serialize)]
pub struct SystemLoadSnapshot {
    pub cpu_percent: Option<f32>,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
}

#[derive(Default)]
pub struct SystemLoad {
    system: System,
    latest: Option<(Instant, SystemLoadSnapshot)>,
}

impl SystemLoad {
    /// Refresh only CPU and memory. The first CPU reading needs a second sample.
    pub fn sample(&mut self) -> SystemLoadSnapshot {
        if let Some((at, snapshot)) = &self.latest {
            if at.elapsed() < INTERVAL {
                return snapshot.clone();
            }
        }
        self.system.refresh_cpu_usage();
        self.system.refresh_memory();
        let snapshot = SystemLoadSnapshot {
            cpu_percent: self.latest.as_ref().and_then(|_| {
                let value = self.system.global_cpu_info().cpu_usage();
                value.is_finite().then(|| value.clamp(0.0, 100.0))
            }),
            memory_used_bytes: self.system.used_memory(),
            memory_total_bytes: self.system.total_memory(),
        };
        self.latest = Some((Instant::now(), snapshot.clone()));
        snapshot
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_sample_has_no_cpu_and_immediate_requests_reuse_it() {
        let mut monitor = SystemLoad::default();
        let first = monitor.sample();
        assert_eq!(first.cpu_percent, None);
        assert!(first.memory_total_bytes > 0);
        assert!(first.memory_used_bytes <= first.memory_total_bytes);
        let second = monitor.sample();
        assert_eq!(second.cpu_percent, None);
        assert_eq!(second.memory_used_bytes, first.memory_used_bytes);
    }

    #[test]
    fn subsequent_sample_reports_machine_cpu_percentage() {
        let mut monitor = SystemLoad::default();
        monitor.sample();
        std::thread::sleep(INTERVAL);
        let second = monitor.sample();
        assert!(second
            .cpu_percent
            .is_some_and(|cpu| (0.0..=100.0).contains(&cpu)));
    }
}
