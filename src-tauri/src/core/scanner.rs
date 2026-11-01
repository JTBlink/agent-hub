use anyhow::Result;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use super::content_hash;
use super::skill_metadata;
use super::skill_store::DiscoveredSkillRecord;
use super::tool_adapters;

pub struct ScanPlan {
    pub tools_scanned: usize,
    pub skills_found: usize,
    pub discovered: Vec<DiscoveredSkillRecord>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredGroup {
    pub name: String,
    pub fingerprint: Option<String>,
    pub locations: Vec<DiscoveredLocation>,
    pub imported: bool,
    pub found_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredLocation {
    pub id: String,
    pub tool: String,
    pub found_path: String,
    pub is_symlink: bool,
    pub resolved_path: Option<String>,
}

/// Directories to skip during recursive scans (internal/tool-specific metadata).
const RECURSIVE_SCAN_SKIP_DIRS: &[&str] = &[".hub", ".agent-hub", ".git", "node_modules"];

fn symlink_target(path: &Path) -> Option<String> {
    if !path.is_symlink() {
        return None;
    }
    std::fs::canonicalize(path)
        .ok()
        .map(|target| target.to_string_lossy().into_owned())
}

/// Recursively walk `dir` and return all subdirectories that contain SKILL.md.
/// Stops descending when a skill dir is found (skills don't nest). Skips
/// `.git` / `node_modules` / `.hub` and guards against symlink cycles.
pub fn collect_skill_dirs(dir: &Path) -> Vec<PathBuf> {
    let mut results = Vec::new();
    let mut visited = HashSet::new();
    collect_skill_dirs_recursive(dir, &mut visited, &mut results);
    results
}

fn collect_skill_dirs_recursive(
    dir: &Path,
    visited: &mut HashSet<PathBuf>,
    results: &mut Vec<PathBuf>,
) {
    let canonical = std::fs::canonicalize(dir).unwrap_or_else(|_| dir.to_path_buf());
    if !visited.insert(canonical) {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() && !path.is_symlink() {
            continue;
        }
        let dir_name = entry.file_name();
        let dir_name_str = dir_name.to_string_lossy();
        if RECURSIVE_SCAN_SKIP_DIRS.iter().any(|s| dir_name_str == *s) {
            continue;
        }
        if skill_metadata::is_valid_skill_dir(&path) {
            results.push(path);
            continue;
        }
        collect_skill_dirs_recursive(&path, visited, results);
    }
}

/// Build a `DiscoveredSkillRecord` for `path` and push it onto `discovered`,
/// unless `path` is already tracked in `managed_paths`.
fn push_discovered(
    adapter_key: &str,
    path: PathBuf,
    managed_paths: &[String],
    discovered: &mut Vec<DiscoveredSkillRecord>,
    hash_directory: &mut impl FnMut(&Path) -> Option<String>,
) {
    let path_str = path.to_string_lossy().to_string();
    if managed_paths.contains(&path_str) {
        return;
    }
    let name = skill_metadata::infer_skill_name(&path);
    let fingerprint = hash_directory(&path);
    let found_at = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());
    discovered.push(DiscoveredSkillRecord {
        id: uuid::Uuid::new_v4().to_string(),
        tool: adapter_key.to_string(),
        found_path: path_str,
        name_guess: Some(name),
        fingerprint,
        found_at,
        imported_skill_id: None,
    });
}

fn scan_flat_dir(
    adapter_key: &str,
    scan_dir: &Path,
    managed_paths: &[String],
    discovered: &mut Vec<DiscoveredSkillRecord>,
    hash_directory: &mut impl FnMut(&Path) -> Option<String>,
) {
    let entries = match std::fs::read_dir(scan_dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() && !path.is_symlink() {
            continue;
        }
        if !skill_metadata::is_valid_skill_dir(&path) {
            continue;
        }
        push_discovered(adapter_key, path, managed_paths, discovered, hash_directory);
    }
}

fn scan_recursive_dir(
    adapter_key: &str,
    scan_dir: &Path,
    managed_paths: &[String],
    discovered: &mut Vec<DiscoveredSkillRecord>,
    hash_directory: &mut impl FnMut(&Path) -> Option<String>,
) {
    let mut skill_dirs = Vec::new();
    let mut visited = HashSet::new();
    collect_skill_dirs_recursive(scan_dir, &mut visited, &mut skill_dirs);
    for path in skill_dirs {
        push_discovered(adapter_key, path, managed_paths, discovered, hash_directory);
    }
}

#[allow(dead_code)]
pub fn scan_local_skills(managed_paths: &[String]) -> Result<ScanPlan> {
    scan_local_skills_with_adapters(managed_paths, &tool_adapters::default_tool_adapters())
}

pub fn scan_local_skills_with_adapters(
    managed_paths: &[String],
    adapters: &[tool_adapters::ToolAdapter],
) -> Result<ScanPlan> {
    scan_local_skills_with_hasher(managed_paths, adapters, &mut |path| {
        content_hash::hash_directory(path).ok()
    })
}

fn scan_local_skills_with_hasher(
    managed_paths: &[String],
    adapters: &[tool_adapters::ToolAdapter],
    hash_directory: &mut impl FnMut(&Path) -> Option<String>,
) -> Result<ScanPlan> {
    let mut discovered = Vec::new();
    let mut tools_scanned = 0;
    // Shared roots and symlink aliases still produce one location per Agent,
    // but read each physical skill's full content only once in this scan.
    // This cache never survives a scan, so later edits cannot reuse stale hashes.
    let mut fingerprints = HashMap::new();
    let mut cached_hasher = |path: &Path| {
        let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        fingerprints
            .entry(canonical)
            .or_insert_with(|| hash_directory(path))
            .clone()
    };

    for adapter in adapters {
        let primary_scan_dir = adapter.skills_dir();
        let primary_exists = primary_scan_dir.is_dir();
        let additional_dirs = adapter.additional_existing_scan_dirs();

        // Discover via additional_scan_dirs even when the legacy detect dir is
        // missing — handles tools whose skills land in a shared location
        // (e.g. copilot → ~/.agents/skills) on machines without the legacy
        // vendor dir.
        if !primary_exists && additional_dirs.is_empty() {
            continue;
        }

        tools_scanned += 1;

        // Skills-only directories remain discoverable even if they do not
        // provide enough state to detect an installed Agent.
        if primary_exists {
            if adapter.recursive_scan {
                scan_recursive_dir(
                    &adapter.key,
                    &primary_scan_dir,
                    managed_paths,
                    &mut discovered,
                    &mut cached_hasher,
                );
            } else {
                scan_flat_dir(
                    &adapter.key,
                    &primary_scan_dir,
                    managed_paths,
                    &mut discovered,
                    &mut cached_hasher,
                );
            }
        }

        // Additional scan dirs are already resolved to concrete skills roots.
        for scan_dir in additional_dirs {
            scan_flat_dir(
                &adapter.key,
                &scan_dir,
                managed_paths,
                &mut discovered,
                &mut cached_hasher,
            );
        }
    }

    let skills_found = discovered.len();
    Ok(ScanPlan {
        tools_scanned,
        skills_found,
        discovered,
    })
}

pub fn group_discovered(records: &[DiscoveredSkillRecord]) -> Vec<DiscoveredGroup> {
    group_discovered_with_preferred_root(records, &tool_adapters::shared_skills_dir())
}

fn group_discovered_with_preferred_root(
    records: &[DiscoveredSkillRecord],
    preferred_root: &Path,
) -> Vec<DiscoveredGroup> {
    use std::collections::HashMap;
    let mut groups: HashMap<String, DiscoveredGroup> = HashMap::new();

    for rec in records {
        let name = rec.name_guess.clone().unwrap_or_else(|| "unknown".into());
        let group_key = if let Some(fingerprint) = rec.fingerprint.as_deref() {
            format!("fp:{name}:{fingerprint}")
        } else {
            format!("path:{name}:{}", rec.found_path)
        };
        let entry = groups.entry(group_key).or_insert_with(|| DiscoveredGroup {
            name,
            fingerprint: rec.fingerprint.clone(),
            locations: Vec::new(),
            imported: false,
            found_at: rec.found_at,
        });

        if rec.imported_skill_id.is_some() {
            entry.imported = true;
        }

        // Use the earliest found_at
        if rec.found_at < entry.found_at {
            entry.found_at = rec.found_at;
        }

        entry.locations.push(DiscoveredLocation {
            id: rec.id.clone(),
            tool: rec.tool.clone(),
            found_path: rec.found_path.clone(),
            is_symlink: Path::new(&rec.found_path).is_symlink(),
            resolved_path: symlink_target(Path::new(&rec.found_path)),
        });
    }

    let mut result: Vec<_> = groups.into_values().collect();
    for group in &mut result {
        // Keep alternate paths actionable, but default display and imports to
        // the shared root regardless of database or Agent discovery order.
        group
            .locations
            .sort_by_key(|location| !Path::new(&location.found_path).starts_with(preferred_root));
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

#[cfg(test)]
mod tests;
