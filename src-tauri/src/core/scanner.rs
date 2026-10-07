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
}

/// Directories to skip during recursive scans (internal/tool-specific metadata).
const RECURSIVE_SCAN_SKIP_DIRS: &[&str] = &[".hub", ".git", "node_modules"];

fn is_symlink_to_central(path: &Path) -> bool {
    if let Ok(target) = std::fs::read_link(path) {
        let central = super::central_repo::skills_dir();
        return target.starts_with(&central);
    }
    false
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
        if is_symlink_to_central(&path) {
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
        if is_symlink_to_central(&path) || !skill_metadata::is_valid_skill_dir(&path) {
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
        });
    }

    let mut result: Vec<_> = groups.into_values().collect();
    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn write_skill(dir: &Path) {
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join("SKILL.md"), "---\nname: x\n---\n# x").unwrap();
    }

    fn run(root: &Path) -> Vec<PathBuf> {
        let mut results = Vec::new();
        let mut visited = HashSet::new();
        collect_skill_dirs_recursive(root, &mut visited, &mut results);
        results.sort();
        results
    }

    fn test_adapter(key: &str, root: &Path) -> tool_adapters::ToolAdapter {
        tool_adapters::ToolAdapter {
            key: key.into(),
            display_name: key.into(),
            relative_skills_dir: String::new(),
            relative_detect_dir: String::new(),
            additional_scan_dirs: vec![],
            override_skills_dir: Some(root.to_string_lossy().into_owned()),
            is_custom: true,
            recursive_scan: false,
            project_relative_skills_dir: None,
            category: Default::default(),
        }
    }

    #[test]
    fn shared_root_reads_content_once_and_keeps_all_agent_locations() {
        let tmp = tempdir().unwrap();
        write_skill(&tmp.path().join("demo"));
        let adapters = [
            test_adapter("one", tmp.path()),
            test_adapter("two", tmp.path()),
        ];
        let mut reads = 0;
        let plan = scan_local_skills_with_hasher(&[], &adapters, &mut |path| {
            reads += 1;
            content_hash::hash_directory(path).ok()
        })
        .unwrap();
        assert_eq!(plan.tools_scanned, 2);
        assert_eq!(plan.skills_found, 2);
        assert_eq!(group_discovered(&plan.discovered)[0].locations.len(), 2);
        assert_eq!(
            reads, 1,
            "shared directory content should only be read once per scan"
        );
    }

    #[test]
    fn skills_only_scaffolding_remains_discoverable_without_an_installed_agent() {
        let tmp = tempdir().unwrap();
        let root = tmp.path().join("skills");
        write_skill(&root.join("demo"));
        let mut adapter = test_adapter("one", &root);
        adapter.is_custom = false;
        adapter.override_skills_dir = None;
        adapter.relative_detect_dir = tmp.path().to_string_lossy().into_owned();
        adapter.relative_skills_dir = root.to_string_lossy().into_owned();
        assert!(!adapter.is_installed());
        let plan = scan_local_skills_with_adapters(&[], &[adapter]).unwrap();
        assert_eq!(plan.skills_found, 1);
    }

    #[test]
    fn next_scan_sees_content_changes_in_shared_directory() {
        let tmp = tempdir().unwrap();
        let dir = tmp.path().join("demo");
        write_skill(&dir);
        let adapters = [
            test_adapter("one", tmp.path()),
            test_adapter("two", tmp.path()),
        ];
        let first = scan_local_skills_with_adapters(&[], &adapters).unwrap();
        fs::write(dir.join("resource.txt"), "updated").unwrap();
        let second = scan_local_skills_with_adapters(&[], &adapters).unwrap();
        assert_ne!(
            first.discovered[0].fingerprint,
            second.discovered[0].fingerprint
        );
        assert_eq!(
            second.discovered[0].fingerprint,
            second.discovered[1].fingerprint
        );
    }

    #[cfg(unix)]
    #[test]
    fn symlink_aliases_read_once_but_preserve_lexical_locations() {
        let tmp = tempdir().unwrap();
        let first = tmp.path().join("first");
        let second = tmp.path().join("second");
        fs::create_dir_all(&second).unwrap();
        write_skill(&first.join("demo"));
        std::os::unix::fs::symlink(first.join("demo"), second.join("alias")).unwrap();
        let adapters = [test_adapter("one", &first), test_adapter("two", &second)];
        let mut reads = 0;
        let plan = scan_local_skills_with_hasher(&[], &adapters, &mut |path| {
            reads += 1;
            content_hash::hash_directory(path).ok()
        })
        .unwrap();
        assert_eq!(reads, 1);
        assert_eq!(plan.skills_found, 2);
        assert_eq!(
            plan.discovered[0].found_path,
            first.join("demo").to_string_lossy()
        );
        assert_eq!(
            plan.discovered[1].found_path,
            second.join("alias").to_string_lossy()
        );
    }

    /// Reproducible workload, run explicitly when comparing scanner performance.
    #[test]
    #[ignore]
    fn scan_timing_workload() {
        let tmp = tempdir().unwrap();
        let payload = vec![b'x'; 8192];
        for skill in 0..16 {
            let dir = tmp.path().join(format!("skill-{skill}"));
            write_skill(&dir);
            for file in 0..64 {
                fs::write(dir.join(format!("resource-{file}")), &payload).unwrap();
            }
        }
        for count in [1, 8] {
            let adapters: Vec<_> = (0..count)
                .map(|i| test_adapter(&format!("agent-{i}"), tmp.path()))
                .collect();
            let start = std::time::Instant::now();
            let plan = scan_local_skills_with_adapters(&[], &adapters).unwrap();
            println!(
                "fixture agents={count} locations={} elapsed_ms={}",
                plan.skills_found,
                start.elapsed().as_millis()
            );
            assert_eq!(plan.skills_found, 16 * count);
        }
        let detected = tool_adapters::default_tool_adapters()
            .iter()
            .filter(|adapter| adapter.is_installed())
            .count();
        println!("detected_agent_state={detected}");
        let start = std::time::Instant::now();
        let plan = scan_local_skills(&[]).unwrap();
        println!(
            "scan_sources={} locations={} elapsed_ms={}",
            plan.tools_scanned,
            plan.skills_found,
            start.elapsed().as_millis()
        );
    }

    #[test]
    fn recursive_finds_nested_skills() {
        let tmp = tempdir().unwrap();
        write_skill(&tmp.path().join("devops/deploy-k8s"));
        write_skill(&tmp.path().join("software-development/super-dev"));

        let results = run(tmp.path());
        assert_eq!(results.len(), 2);
        let names: Vec<_> = results
            .iter()
            .filter_map(|p| p.file_name().and_then(|n| n.to_str()))
            .collect();
        assert!(names.contains(&"deploy-k8s"));
        assert!(names.contains(&"super-dev"));
    }

    #[test]
    fn recursive_stops_descending_into_skill_dir() {
        // A skill dir's own subdirectories must not be reported as separate skills,
        // even if they happen to contain their own SKILL.md.
        let tmp = tempdir().unwrap();
        write_skill(&tmp.path().join("my-skill"));
        write_skill(&tmp.path().join("my-skill/nested"));

        let results = run(tmp.path());
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].file_name().unwrap(), "my-skill");
    }

    #[test]
    fn recursive_skips_internal_dirs() {
        let tmp = tempdir().unwrap();
        write_skill(&tmp.path().join(".git/bogus"));
        write_skill(&tmp.path().join("node_modules/pkg"));
        write_skill(&tmp.path().join(".hub/hidden"));
        write_skill(&tmp.path().join("real-category/real-skill"));

        let results = run(tmp.path());
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].file_name().unwrap(), "real-skill");
    }

    #[test]
    fn recursive_finds_deeply_nested_skill() {
        let tmp = tempdir().unwrap();
        let mut deep = tmp.path().to_path_buf();
        for _ in 0..16 {
            deep = deep.join("lvl");
        }
        write_skill(&deep);

        let results = run(tmp.path());
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].file_name().unwrap(), "lvl");
    }

    #[cfg(unix)]
    #[test]
    fn recursive_survives_symlink_cycle() {
        use std::os::unix::fs::symlink;

        let tmp = tempdir().unwrap();
        write_skill(&tmp.path().join("category/real-skill"));
        // Self-referential loop: `category/loop -> category`
        symlink(
            tmp.path().join("category"),
            tmp.path().join("category/loop"),
        )
        .unwrap();

        let results = run(tmp.path());
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].file_name().unwrap(), "real-skill");
    }

    #[test]
    fn flat_scan_requires_skill_marker() {
        let tmp = tempdir().unwrap();
        fs::create_dir_all(tmp.path().join("not-a-skill")).unwrap();
        write_skill(&tmp.path().join("real-skill"));

        let adapter = tool_adapters::ToolAdapter {
            key: "test".into(),
            display_name: "Test".into(),
            relative_skills_dir: String::new(),
            relative_detect_dir: String::new(),
            additional_scan_dirs: vec![],
            override_skills_dir: Some(tmp.path().to_string_lossy().to_string()),
            is_custom: true,
            recursive_scan: false,
            project_relative_skills_dir: None,
            category: Default::default(),
        };

        let plan = scan_local_skills_with_adapters(&[], &[adapter]).unwrap();
        assert_eq!(plan.skills_found, 1);
        assert_eq!(
            plan.discovered[0].found_path,
            tmp.path().join("real-skill").to_string_lossy()
        );
    }

    #[test]
    fn additional_scan_dirs_scan_concrete_skills_roots() {
        let tmp = tempdir().unwrap();
        let primary = tmp.path().join("skills");
        let plugin_skills = tmp.path().join("plugins").join("vendor").join("skills");
        fs::create_dir_all(&primary).unwrap();
        write_skill(&plugin_skills.join("packaged-skill"));

        let adapter = tool_adapters::ToolAdapter {
            key: "test".into(),
            display_name: "Test".into(),
            relative_skills_dir: String::new(),
            relative_detect_dir: String::new(),
            additional_scan_dirs: vec![],
            override_skills_dir: Some(primary.to_string_lossy().to_string()),
            is_custom: true,
            recursive_scan: false,
            project_relative_skills_dir: None,
            category: Default::default(),
        };

        let adapter_with_extra = tool_adapters::ToolAdapter {
            additional_scan_dirs: vec![plugin_skills.to_string_lossy().to_string()],
            ..adapter
        };

        let plan = scan_local_skills_with_adapters(&[], &[adapter_with_extra]).unwrap();
        assert_eq!(plan.skills_found, 1);
        assert_eq!(
            plan.discovered[0].found_path,
            plugin_skills.join("packaged-skill").to_string_lossy()
        );
    }

    #[test]
    fn grouping_keeps_same_name_different_fingerprint_separate() {
        let records = vec![
            DiscoveredSkillRecord {
                id: "1".into(),
                tool: "a".into(),
                found_path: "/tmp/one".into(),
                name_guess: Some("shared".into()),
                fingerprint: Some("hash-a".into()),
                found_at: 10,
                imported_skill_id: None,
            },
            DiscoveredSkillRecord {
                id: "2".into(),
                tool: "b".into(),
                found_path: "/tmp/two".into(),
                name_guess: Some("shared".into()),
                fingerprint: Some("hash-b".into()),
                found_at: 20,
                imported_skill_id: None,
            },
        ];

        let groups = group_discovered(&records);
        assert_eq!(groups.len(), 2);
    }

    #[test]
    fn grouping_merges_same_name_same_fingerprint() {
        let records = vec![
            DiscoveredSkillRecord {
                id: "1".into(),
                tool: "a".into(),
                found_path: "/tmp/one".into(),
                name_guess: Some("shared".into()),
                fingerprint: Some("hash-a".into()),
                found_at: 10,
                imported_skill_id: None,
            },
            DiscoveredSkillRecord {
                id: "2".into(),
                tool: "b".into(),
                found_path: "/tmp/two".into(),
                name_guess: Some("shared".into()),
                fingerprint: Some("hash-a".into()),
                found_at: 20,
                imported_skill_id: None,
            },
        ];

        let groups = group_discovered(&records);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].locations.len(), 2);
    }
}
