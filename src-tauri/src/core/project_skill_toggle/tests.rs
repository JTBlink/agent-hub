use super::set_project_skill_enabled_state;
use crate::core::error::ErrorKind;
use std::fs;
use tempfile::tempdir;

#[cfg(unix)]
#[test]
fn set_project_skill_enabled_state_disabling_cleans_duplicate_symlink_without_touching_target() {
    use std::os::unix::fs::symlink;

    let tmp = tempdir().unwrap();
    let central_skill = tmp.path().join("central").join("understand-diff");
    let skills_root = tmp.path().join("skills");
    let disabled_root = tmp.path().join("skills-disabled");
    let relative_path = "understand-diff";

    fs::create_dir_all(&central_skill).unwrap();
    fs::write(
        central_skill.join("SKILL.md"),
        "---\nname: understand-diff\n---\n",
    )
    .unwrap();
    fs::create_dir_all(&skills_root).unwrap();
    fs::create_dir_all(&disabled_root).unwrap();

    symlink(&central_skill, skills_root.join(relative_path)).unwrap();
    symlink(&central_skill, disabled_root.join(relative_path)).unwrap();

    set_project_skill_enabled_state(&skills_root, &disabled_root, relative_path, false).unwrap();

    assert!(!skills_root.join(relative_path).exists());
    assert!(disabled_root.join(relative_path).exists());
    assert!(central_skill.exists());
    assert!(central_skill.join("SKILL.md").is_file());
}

#[cfg(unix)]
#[test]
fn set_project_skill_enabled_state_enabling_cleans_duplicate_symlink_without_touching_target() {
    use std::os::unix::fs::symlink;

    let tmp = tempdir().unwrap();
    let central_skill = tmp.path().join("central").join("understand-diff");
    let skills_root = tmp.path().join("skills");
    let disabled_root = tmp.path().join("skills-disabled");
    let relative_path = "understand-diff";

    fs::create_dir_all(&central_skill).unwrap();
    fs::write(
        central_skill.join("SKILL.md"),
        "---\nname: understand-diff\n---\n",
    )
    .unwrap();
    fs::create_dir_all(&skills_root).unwrap();
    fs::create_dir_all(&disabled_root).unwrap();

    symlink(&central_skill, skills_root.join(relative_path)).unwrap();
    symlink(&central_skill, disabled_root.join(relative_path)).unwrap();

    set_project_skill_enabled_state(&skills_root, &disabled_root, relative_path, true).unwrap();

    assert!(skills_root.join(relative_path).exists());
    assert!(!disabled_root.join(relative_path).exists());
    assert!(central_skill.exists());
    assert!(central_skill.join("SKILL.md").is_file());
}

#[test]
fn set_project_skill_enabled_state_enabling_removes_emptied_disabled_dir() {
    let tmp = tempdir().unwrap();
    let skills_root = tmp.path().join("skills");
    let disabled_root = tmp.path().join("skills-disabled");
    let relative_path = "my-skill";

    let real_disabled = disabled_root.join(relative_path);
    fs::create_dir_all(&skills_root).unwrap();
    fs::create_dir_all(&real_disabled).unwrap();
    fs::write(real_disabled.join("SKILL.md"), "---\nname: my-skill\n---\n").unwrap();

    set_project_skill_enabled_state(&skills_root, &disabled_root, relative_path, true).unwrap();

    assert!(skills_root.join(relative_path).join("SKILL.md").is_file());
    assert!(!disabled_root.exists());
}

#[test]
fn set_project_skill_enabled_state_enabling_keeps_disabled_dir_when_other_skills_remain() {
    let tmp = tempdir().unwrap();
    let skills_root = tmp.path().join("skills");
    let disabled_root = tmp.path().join("skills-disabled");
    let relative_path = "skill-a";

    let real_disabled_a = disabled_root.join(relative_path);
    let real_disabled_b = disabled_root.join("skill-b");
    fs::create_dir_all(&skills_root).unwrap();
    fs::create_dir_all(&real_disabled_a).unwrap();
    fs::create_dir_all(&real_disabled_b).unwrap();
    fs::write(
        real_disabled_a.join("SKILL.md"),
        "---\nname: skill-a\n---\n",
    )
    .unwrap();
    fs::write(
        real_disabled_b.join("SKILL.md"),
        "---\nname: skill-b\n---\n",
    )
    .unwrap();

    set_project_skill_enabled_state(&skills_root, &disabled_root, relative_path, true).unwrap();

    assert!(skills_root.join(relative_path).join("SKILL.md").is_file());
    assert!(disabled_root.is_dir());
    assert!(real_disabled_b.join("SKILL.md").is_file());
}

#[test]
fn set_project_skill_enabled_state_enabling_removes_empty_nested_disabled_dirs() {
    let tmp = tempdir().unwrap();
    let skills_root = tmp.path().join("skills");
    let disabled_root = tmp.path().join("skills-disabled");
    let relative_path = "category/sub/skill-a";

    let real_disabled = disabled_root.join(relative_path);
    fs::create_dir_all(&skills_root).unwrap();
    fs::create_dir_all(&real_disabled).unwrap();
    fs::write(real_disabled.join("SKILL.md"), "---\nname: skill-a\n---\n").unwrap();

    set_project_skill_enabled_state(&skills_root, &disabled_root, relative_path, true).unwrap();

    assert!(skills_root.join(relative_path).join("SKILL.md").is_file());
    assert!(!disabled_root.exists());
}

#[test]
fn set_project_skill_enabled_state_rejects_real_dir_duplicate_on_enable() {
    let tmp = tempdir().unwrap();
    let skills_root = tmp.path().join("skills");
    let disabled_root = tmp.path().join("skills-disabled");
    let relative_path = "my-skill";

    let real_enabled = skills_root.join(relative_path);
    let real_disabled = disabled_root.join(relative_path);
    fs::create_dir_all(&real_enabled).unwrap();
    fs::write(real_enabled.join("SKILL.md"), "---\nname: my-skill\n---\n").unwrap();
    fs::create_dir_all(&real_disabled).unwrap();
    fs::write(real_disabled.join("SKILL.md"), "---\nname: my-skill\n---\n").unwrap();

    let err = set_project_skill_enabled_state(&skills_root, &disabled_root, relative_path, true)
        .unwrap_err();
    assert_eq!(err.kind, ErrorKind::InvalidInput);
    // Both real dirs must still exist
    assert!(real_enabled.join("SKILL.md").exists());
    assert!(real_disabled.join("SKILL.md").exists());
}

#[test]
fn set_project_skill_enabled_state_rejects_real_dir_duplicate_on_disable() {
    let tmp = tempdir().unwrap();
    let skills_root = tmp.path().join("skills");
    let disabled_root = tmp.path().join("skills-disabled");
    let relative_path = "my-skill";

    let real_enabled = skills_root.join(relative_path);
    let real_disabled = disabled_root.join(relative_path);
    fs::create_dir_all(&real_enabled).unwrap();
    fs::write(real_enabled.join("SKILL.md"), "---\nname: my-skill\n---\n").unwrap();
    fs::create_dir_all(&real_disabled).unwrap();
    fs::write(real_disabled.join("SKILL.md"), "---\nname: my-skill\n---\n").unwrap();

    let err = set_project_skill_enabled_state(&skills_root, &disabled_root, relative_path, false)
        .unwrap_err();
    assert_eq!(err.kind, ErrorKind::InvalidInput);
    assert!(real_enabled.join("SKILL.md").exists());
    assert!(real_disabled.join("SKILL.md").exists());
}
#[cfg(unix)]
#[test]
fn concurrent_toggles_of_shared_agent_directory_preserve_skill() {
    use std::os::unix::fs::symlink;
    use std::sync::Barrier;

    let tmp = tempdir().unwrap();
    let shared = tmp.path().join("shared/skills");
    let alias = tmp.path().join("agent/skills");
    let disabled = tmp.path().join("shared/skills-disabled");
    fs::create_dir_all(&shared).unwrap();
    fs::create_dir_all(alias.parent().unwrap()).unwrap();
    symlink(&shared, &alias).unwrap();
    fs::create_dir_all(shared.join("demo")).unwrap();
    fs::write(shared.join("demo/SKILL.md"), "# Demo\n").unwrap();

    for _ in 0..40 {
        for enabled in [false, true] {
            let barrier = Barrier::new(16);
            std::thread::scope(|scope| {
                let mut handles = Vec::new();
                for index in 0..16 {
                    let root = if index % 2 == 0 { &shared } else { &alias };
                    let barrier = &barrier;
                    let disabled = &disabled;
                    handles.push(scope.spawn(move || {
                        barrier.wait();
                        set_project_skill_enabled_state(root, disabled, "demo", enabled)
                    }));
                }
                for handle in handles {
                    handle.join().unwrap().unwrap();
                }
            });
            let expected_root = if enabled { &shared } else { &disabled };
            assert_eq!(
                fs::read_to_string(expected_root.join("demo/SKILL.md")).unwrap(),
                "# Demo\n"
            );
        }
    }
}
