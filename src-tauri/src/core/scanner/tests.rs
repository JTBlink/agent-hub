use super::*;
#[cfg(unix)]
use crate::core::central_repo;
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
    let groups = group_discovered(&plan.discovered);
    let locations: Vec<_> = groups.iter().flat_map(|group| &group.locations).collect();
    assert!(
        !locations
            .iter()
            .find(|location| location.tool == "one")
            .unwrap()
            .is_symlink
    );
    let linked = locations
        .iter()
        .find(|location| location.tool == "two")
        .unwrap();
    assert!(linked.is_symlink);
    assert_eq!(serde_json::to_value(linked).unwrap()["is_symlink"], true);
    assert_eq!(
        serde_json::to_value(linked).unwrap()["resolved_path"],
        serde_json::Value::String(
            first
                .join("demo")
                .canonicalize()
                .unwrap()
                .to_string_lossy()
                .into_owned()
        )
    );
}

#[cfg(unix)]
#[test]
fn scans_absolute_alias_into_shared_library_for_local_cleanup() {
    let _guard = central_repo::test_base_dir_lock();
    let tmp = tempdir().unwrap();
    central_repo::set_test_base_dir_override(Some(tmp.path().join("repo")));
    let central = central_repo::skills_dir().join("demo");
    let agent_root = tmp.path().join("agent/skills");
    write_skill(&central);
    fs::create_dir_all(&agent_root).unwrap();
    let alias = agent_root.join("demo");
    std::os::unix::fs::symlink(&central, &alias).unwrap();

    let plan = scan_local_skills_with_adapters(&[], &[test_adapter("agent", &agent_root)]).unwrap();
    assert_eq!(plan.skills_found, 1);
    let location = &group_discovered(&plan.discovered)[0].locations[0];
    assert_eq!(location.found_path, alias.to_string_lossy());
    let real = central.canonicalize().unwrap();
    assert_eq!(location.resolved_path.as_deref(), real.to_str());
    central_repo::set_test_base_dir_override(None);
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

#[test]
fn grouping_prefers_shared_agents_root_for_primary_location() {
    let preferred = PathBuf::from("/tmp/shared/.agents/skills");
    let records = vec![
        DiscoveredSkillRecord {
            id: "other".into(),
            tool: "other-agent".into(),
            found_path: "/tmp/other/skills/demo".into(),
            name_guess: Some("demo".into()),
            fingerprint: Some("same".into()),
            found_at: 10,
            imported_skill_id: None,
        },
        DiscoveredSkillRecord {
            id: "shared".into(),
            tool: "codex".into(),
            found_path: "/tmp/shared/.agents/skills/demo".into(),
            name_guess: Some("demo".into()),
            fingerprint: Some("same".into()),
            found_at: 20,
            imported_skill_id: None,
        },
    ];

    let groups = group_discovered_with_preferred_root(&records, &preferred);
    assert_eq!(groups[0].locations[0].id, "shared");
    assert_eq!(groups[0].locations[1].id, "other");
}
