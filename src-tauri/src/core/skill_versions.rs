use std::path::Path;

use super::skill_metadata;

/// Compare declared SemVer precedence, without inferring versions from hashes.
pub fn compare_versions(central: Option<&str>, source: Option<&str>) -> &'static str {
    let parse = |value: Option<&str>| {
        value.and_then(|v| semver::Version::parse(v.trim().trim_start_matches('v')).ok())
    };
    match (parse(central), parse(source)) {
        (Some(left), Some(right)) => match left.cmp_precedence(&right) {
            std::cmp::Ordering::Greater => "central_newer",
            std::cmp::Ordering::Less => "source_newer",
            std::cmp::Ordering::Equal => "same_version",
        },
        _ => "unknown",
    }
}

/// Read both live directories so stale database metadata cannot allow a downgrade.
pub fn compare_directories(central: &Path, source: &Path) -> &'static str {
    compare_versions(
        skill_metadata::parse_skill_md(central).version.as_deref(),
        skill_metadata::parse_skill_md(source).version.as_deref(),
    )
}

#[cfg(test)]
mod tests;
