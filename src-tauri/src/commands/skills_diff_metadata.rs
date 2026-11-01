use crate::core::{skill_metadata, skill_versions::compare_versions};
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

#[cfg(test)]
mod tests;
