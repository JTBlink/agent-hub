use super::*;

#[test]
fn compares_versions_numerically_and_keeps_unknown_versions_unknown() {
    for (central, source, expected) in [
        (Some("0.2.0"), Some("0.1.1"), "central_newer"),
        (Some("1.10.0"), Some("1.9.0"), "central_newer"),
        (Some("v1.0.0-rc.1"), Some("1.0.0"), "source_newer"),
        (Some("1.0.0+a"), Some("1.0.0+b"), "same_version"),
        (None, Some("1.0.0"), "unknown"),
        (Some("workspace"), Some("1.0.0"), "unknown"),
    ] {
        assert_eq!(compare_versions(central, source), expected);
    }
}
