use crate::core::skill_metadata;
use serde::Serialize;
use std::path::Path;

/// Whole-directory diff between the central copy (`original`) and the source
/// (`updated`), covering the same file scope that drives the update badge so
/// the diff can never come back empty while the badge says "update available".
#[derive(Debug, Serialize)]
pub struct SkillSourceDiffDto {
    pub skill_id: String,
    pub source_label: String,
    pub revision: String,
    pub central_path: String,
    pub source_path: String,
    pub central_version: Option<String>,
    pub source_version: Option<String>,
    /// "central_newer" | "source_newer" | "same_version" | "unknown"
    pub version_comparison: String,
    pub entries: Vec<SkillSourceDiffEntryDto>,
}

#[derive(Debug, Serialize)]
pub struct SkillSourceDiffEntryDto {
    pub relative_path: String,
    /// "added" | "removed" | "modified"
    pub status: String,
    /// "text" | "binary" | "too_large" | "permission_only"
    pub content_kind: String,
    /// Present only when `content_kind == "text"`.
    pub original_text: Option<String>,
    pub updated_text: Option<String>,
    pub executable_before: bool,
    pub executable_after: bool,
}

impl SkillSourceDiffDto {
    /// Describe the compared directories using persistent locations, never a temporary clone.
    pub(super) fn from_directories(
        skill_id: String,
        source_label: String,
        revision: String,
        central_dir: &Path,
        source_dir: &Path,
        source_path: String,
        entries: Vec<SkillSourceDiffEntryDto>,
    ) -> Self {
        let central_version = skill_metadata::parse_skill_md(central_dir).version;
        let source_version = skill_metadata::parse_skill_md(source_dir).version;
        let version_comparison =
            compare_versions(central_version.as_deref(), source_version.as_deref());
        Self {
            skill_id,
            source_label,
            revision,
            central_path: central_dir.to_string_lossy().into_owned(),
            source_path,
            central_version,
            source_version,
            version_comparison: version_comparison.to_string(),
            entries,
        }
    }
}

fn compare_versions(central: Option<&str>, source: Option<&str>) -> &'static str {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_declared_versions_without_guessing_from_content_changes() {
        assert_eq!(
            compare_versions(Some("1.10.0"), Some("1.9.0")),
            "central_newer"
        );
        assert_eq!(
            compare_versions(Some("v1.0.0-rc.1"), Some("1.0.0")),
            "source_newer"
        );
        assert_eq!(
            compare_versions(Some("1.0.0+a"), Some("1.0.0+b")),
            "same_version"
        );
        assert_eq!(compare_versions(None, Some("1.0.0")), "unknown");
        assert_eq!(
            compare_versions(Some("workspace"), Some("1.0.0")),
            "unknown"
        );
    }

    #[test]
    fn describes_actual_versions_and_persistent_source_location() {
        let temp = tempfile::tempdir().unwrap();
        let central = temp.path().join("library/demo");
        let source = temp.path().join("checkout/demo");
        std::fs::create_dir_all(&central).unwrap();
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(central.join("SKILL.md"), "---\nversion: 1.0.0\n---\n").unwrap();
        std::fs::write(
            source.join("SKILL.md"),
            "---\nmetadata:\n  version: 1.1.0\n---\n",
        )
        .unwrap();
        let dto = SkillSourceDiffDto::from_directories(
            "demo".into(),
            "git".into(),
            "revision".into(),
            &central,
            &source,
            "https://example.invalid/repo :: skills/demo".into(),
            vec![],
        );
        assert_eq!(dto.central_path, central.to_string_lossy());
        assert_eq!(
            dto.source_path,
            "https://example.invalid/repo :: skills/demo"
        );
        assert_eq!(dto.source_version.as_deref(), Some("1.1.0"));
        assert_eq!(dto.version_comparison, "source_newer");
    }
}
