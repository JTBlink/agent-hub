use std::sync::atomic::{AtomicBool, Ordering};

/// Decide whether a per-command timing line should be logged.
///
/// Strategy: always log the very first call after process start (to
/// capture a cold baseline), then for subsequent calls only log when the
/// elapsed time crosses `slow_threshold_ms`. This keeps diagnostic
/// visibility for slow paths while preventing the log file from being
/// flooded with one INFO line per refresh during normal interactive use.
pub fn should_log_first_or_slow(
    first_call: &AtomicBool,
    elapsed_ms: u128,
    slow_threshold_ms: u128,
) -> bool {
    if first_call.swap(false, Ordering::Relaxed) {
        return true;
    }
    elapsed_ms >= slow_threshold_ms
}

#[cfg(test)]
mod tests;
