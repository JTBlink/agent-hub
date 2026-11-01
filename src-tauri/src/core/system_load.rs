//! Local machine CPU, RAM and home-volume disk sampling, shared across status-bar requests.
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
    pub disk_available_bytes: Option<u64>,
    pub disk_total_bytes: Option<u64>,
}

#[derive(Default)]
pub struct SystemLoad {
    system: System,
    latest: Option<(Instant, SystemLoadSnapshot)>,
}

impl SystemLoad {
    /// Refresh CPU, memory and home-volume capacity without scanning directories. The first CPU reading needs a second sample.
    pub fn sample(&mut self) -> SystemLoadSnapshot {
        if let Some((at, snapshot)) = &self.latest {
            if at.elapsed() < INTERVAL {
                return snapshot.clone();
            }
        }
        self.system.refresh_cpu_usage();
        self.system.refresh_memory();
        let disk = dirs::home_dir().and_then(|path| fs2::statvfs(path).ok());
        let snapshot = SystemLoadSnapshot {
            cpu_percent: self.latest.as_ref().and_then(|_| {
                let value = self.system.global_cpu_info().cpu_usage();
                value.is_finite().then(|| value.clamp(0.0, 100.0))
            }),
            memory_used_bytes: self.system.used_memory(),
            memory_total_bytes: self.system.total_memory(),
            disk_available_bytes: disk.as_ref().map(fs2::FsStats::available_space),
            disk_total_bytes: disk.as_ref().map(fs2::FsStats::total_space),
        };
        self.latest = Some((Instant::now(), snapshot.clone()));
        snapshot
    }
}

#[cfg(test)]
mod tests;
