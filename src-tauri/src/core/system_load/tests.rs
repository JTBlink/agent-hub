use super::*;

#[test]
fn first_sample_has_no_cpu_and_immediate_requests_reuse_it() {
    let mut monitor = SystemLoad::default();
    let first = monitor.sample();
    assert_eq!(first.cpu_percent, None);
    assert!(first.memory_total_bytes > 0);
    assert!(first.memory_used_bytes <= first.memory_total_bytes);
    assert!(first.disk_total_bytes.is_some_and(|total| total > 0));
    assert!(first.disk_available_bytes <= first.disk_total_bytes);
    let second = monitor.sample();
    assert_eq!(second.disk_available_bytes, first.disk_available_bytes);
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
