use std::path::Path;

pub struct SkillMeta {
    pub name: Option<String>,
    pub description: Option<String>,
    pub version: Option<String>,
}

fn read_named_file_exact(dir: &Path, target_name: &str) -> Option<String> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        if !entry.file_type().ok()?.is_file() {
            continue;
        }
        if entry.file_name().to_string_lossy() == target_name {
            return std::fs::read_to_string(entry.path()).ok();
        }
    }
    None
}

fn has_named_file_exact(dir: &Path, target_name: &str) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries.flatten().any(|entry| {
        entry.file_type().map(|ft| ft.is_file()).unwrap_or(false)
            && entry.file_name().to_string_lossy() == target_name
    })
}

pub fn parse_skill_md(dir: &Path) -> SkillMeta {
    parse_skill_md_with_candidates(dir, &["SKILL.md", "skill.md"])
}

fn parse_skill_md_with_candidates(dir: &Path, candidates: &[&str]) -> SkillMeta {
    for candidate in candidates {
        if let Some(content) = read_named_file_exact(dir, candidate) {
            return parse_frontmatter(&content);
        }
    }
    SkillMeta {
        name: None,
        description: None,
        version: None,
    }
}

pub(crate) fn parse_frontmatter(content: &str) -> SkillMeta {
    let trimmed = content.trim();
    if !trimmed.starts_with("---") {
        return SkillMeta {
            name: None,
            description: None,
            version: None,
        };
    }

    let rest = &trimmed[3..];
    if let Some(end) = rest.find("---") {
        let yaml_str = &rest[..end];
        if let Ok(yaml) = serde_yaml::from_str::<serde_yaml::Value>(yaml_str) {
            let name = yaml
                .get("name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let description = yaml
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let version = yaml
                .get("version")
                .and_then(|v| v.as_str())
                .or_else(|| yaml.get("metadata")?.get("version")?.as_str())
                .map(|s| s.to_string());
            return SkillMeta {
                name,
                description,
                version,
            };
        }
    }

    SkillMeta {
        name: None,
        description: None,
        version: None,
    }
}

/// Skill directory marker files used across the application.
pub(crate) const SKILL_DIR_MARKERS: &[&str] = &["SKILL.md", "skill.md"];

/// Check whether a directory looks like a valid skill directory
/// (contains at least one recognised marker file).
pub fn is_valid_skill_dir(dir: &Path) -> bool {
    dir.is_dir()
        && SKILL_DIR_MARKERS
            .iter()
            .any(|name| has_named_file_exact(dir, name))
}

/// Characters that are invalid in Windows file/directory names.
const WINDOWS_RESERVED: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/// Reserved Windows device names that cannot be used as file/directory names.
const WINDOWS_RESERVED_BASENAMES: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Sanitize a skill name so it is safe to use as a single directory component
/// on all major platforms (macOS, Linux, Windows).
///
/// Security-focused with cross-platform safety:
/// - Strips path traversal (`../`) via `Path::file_name()`
/// - Rejects bare `.` and `..`
/// - Replaces control characters with `_` (preserves position for near-injectivity)
/// - Replaces Windows-reserved characters (`<>:"/\|?*`) with `_`
/// - Trims leading/trailing whitespace and dots (Windows rejects trailing dots)
///
/// Returns `None` if the result would be empty or unsafe.
pub fn sanitize_skill_name(name: &str) -> Option<String> {
    // Take only the last path component — strips any leading `../` sequences.
    let last = std::path::Path::new(name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())?;

    // Reject bare `.` and `..` (file_name() returns None for `..` on most
    // platforms, but be explicit for cross-platform safety).
    if last == ".." || last == "." {
        return None;
    }

    // Replace control characters and Windows-reserved characters with `_`.
    // Using replacement instead of removal preserves character positions,
    // making the mapping nearly injective (distinct inputs → distinct outputs).
    let clean: String = last
        .chars()
        .map(|c| {
            if c.is_control() || WINDOWS_RESERVED.contains(&c) {
                '_'
            } else {
                c
            }
        })
        .collect();

    // Trim whitespace and trailing dots (Windows ignores trailing dots/spaces
    // in directory names, which would cause silent mismatches).
    let trimmed = clean.trim().trim_end_matches('.');
    if trimmed.is_empty() {
        None
    } else {
        let reserved = trimmed
            .split('.')
            .next()
            .map(|base| base.to_ascii_uppercase())
            .map(|upper| WINDOWS_RESERVED_BASENAMES.contains(&upper.as_str()))
            .unwrap_or(false);

        if reserved {
            Some(format!("_{}", trimmed))
        } else {
            Some(trimmed.to_string())
        }
    }
}

pub fn infer_skill_name(dir: &Path) -> String {
    let meta = parse_skill_md(dir);
    if let Some(name) = meta.name {
        if let Some(sanitized) = sanitize_skill_name(&name) {
            return sanitized;
        }
    }
    dir.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown-skill".to_string())
}

/// Rewrite the `name:` field inside the SKILL.md frontmatter to `new_name`.
/// Returns `true` if the file was updated, `false` if no SKILL.md or no
/// frontmatter `name` field was found.
pub fn update_skill_md_name(dir: &Path, new_name: &str) -> anyhow::Result<bool> {
    for candidate in SKILL_DIR_MARKERS {
        let Some(content) = read_named_file_exact(dir, candidate) else {
            continue;
        };
        let trimmed = content.trim_start();
        if !trimmed.starts_with("---") {
            continue;
        }
        let rest = &trimmed[3..];
        let Some(end) = rest.find("---") else {
            continue;
        };
        let fm_start = content.find("---").unwrap();
        let fm_body_start = fm_start + 3;
        let fm_body_end = fm_body_start + end;
        let fm_body = &content[fm_body_start..fm_body_end];
        let mut updated_lines = Vec::new();
        let mut found = false;
        for line in fm_body.lines() {
            let stripped = line.trim_start();
            if line.starts_with("name:") && !found {
                // Preserve leading whitespace.
                let indent = &line[..line.len() - stripped.len()];
                let quoted_name = serde_json::to_string(new_name)?;
                updated_lines.push(format!("{indent}name: {quoted_name}"));
                found = true;
            } else {
                updated_lines.push(line.to_string());
            }
        }
        if !found {
            continue;
        }
        // Preserve original trailing newline in the frontmatter body.
        let trailing = if fm_body.ends_with('\n') { "\n" } else { "" };
        let new_body = updated_lines.join("\n") + trailing;
        let new_content = format!(
            "{}{}{}",
            &content[..fm_body_start],
            new_body,
            &content[fm_body_end..],
        );
        // Resolve file path case-exactly (the candidate name may differ).
        let file_path = dir.join(candidate);
        std::fs::write(&file_path, new_content)?;
        return Ok(true);
    }
    Ok(false)
}

#[cfg(test)]
mod tests;
