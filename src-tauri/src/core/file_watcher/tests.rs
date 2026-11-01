use super::{collect_watch_paths, muted_at};
use crate::core::skill_store::{ProjectRecord, SkillStore};
use std::fs;
use tempfile::tempdir;

#[test]
fn self_write_mute_window_is_half_open() {
    // Muted strictly before the deadline; the deadline instant itself and
    // anything after are live again, so the window can never wedge shut.
    assert!(muted_at(5, 10));
    assert!(!muted_at(10, 10));
    assert!(!muted_at(11, 10));
    // A zeroed deadline (never muted) is never active.
    assert!(!muted_at(0, 0));
}

#[test]
fn mute_swallows_own_echo_but_defers_foreign_changes() {
    use super::{decide_emit, EmitAction, MuteVerdict};

    // Our own write echo is the thing the mute exists to swallow (#248).
    assert_eq!(
        decide_emit(true, MuteVerdict::SelfWrite, false),
        EmitAction::Skip
    );
    // A real foreign change during the window must survive as a deferred
    // emit — never vanish — regardless of debounce.
    assert_eq!(
        decide_emit(true, MuteVerdict::Foreign, false),
        EmitAction::Defer
    );
    assert_eq!(
        decide_emit(true, MuteVerdict::Foreign, true),
        EmitAction::Defer
    );
    // Live and quiet → emit; only debounce coalesces.
    assert_eq!(
        decide_emit(true, MuteVerdict::Live, false),
        EmitAction::Emit
    );
    assert_eq!(decide_emit(true, MuteVerdict::Live, true), EmitAction::Skip);
    // Irrelevant events never emit or defer, muted or not.
    assert_eq!(
        decide_emit(false, MuteVerdict::Foreign, false),
        EmitAction::Skip
    );
    assert_eq!(
        decide_emit(false, MuteVerdict::Live, false),
        EmitAction::Skip
    );
}

#[test]
fn mute_classification_is_path_scoped() {
    use super::{classify_mute, MuteVerdict};
    use std::path::PathBuf;

    let roots = vec![PathBuf::from("/agents/claude/skills/foo")];
    let inside = vec![PathBuf::from("/agents/claude/skills/foo/SKILL.md")];
    let outside = vec![PathBuf::from("/agents/codex/skills/bar/SKILL.md")];
    let mixed = vec![inside[0].clone(), outside[0].clone()];

    // Outside the window everything is Live, whatever the paths say.
    assert_eq!(classify_mute(10, 10, &roots, &inside), MuteVerdict::Live);

    // Inside the window: only events fully under a written root are our
    // own echo; anything touching other paths is a foreign change.
    assert_eq!(
        classify_mute(5, 10, &roots, &inside),
        MuteVerdict::SelfWrite
    );
    assert_eq!(classify_mute(5, 10, &roots, &outside), MuteVerdict::Foreign);
    assert_eq!(classify_mute(5, 10, &roots, &mixed), MuteVerdict::Foreign);
    // No path info (watch-set rescan) defers rather than vanishes.
    assert_eq!(classify_mute(5, 10, &roots, &[]), MuteVerdict::Foreign);
}

#[test]
fn linked_workspace_watch_paths_only_include_selected_roots() {
    let tmp = tempdir().unwrap();
    let db_path = tmp.path().join("watcher.db");
    let skills_root = tmp.path().join("external").join("skills");
    let disabled_root = tmp.path().join("external").join("skills-disabled");
    fs::create_dir_all(&skills_root).unwrap();
    fs::create_dir_all(&disabled_root).unwrap();

    let store = SkillStore::new(&db_path).unwrap();
    store
        .insert_project(&ProjectRecord {
            id: "linked-1".to_string(),
            name: "External".to_string(),
            path: skills_root.to_string_lossy().to_string(),
            workspace_type: "linked".to_string(),
            linked_agent_key: Some("external".to_string()),
            linked_agent_name: Some("External".to_string()),
            disabled_path: Some(disabled_root.to_string_lossy().to_string()),
            sort_order: 0,
            created_at: 0,
            updated_at: 0,
            visited_at: None,
        })
        .unwrap();

    let paths = collect_watch_paths(&store);
    assert!(paths.contains(&skills_root));
    assert!(paths.contains(&disabled_root));
    assert!(!paths.contains(&skills_root.parent().unwrap().to_path_buf()));
    assert!(!paths.contains(&disabled_root.parent().unwrap().to_path_buf()));
}

fn insert_non_linked_project(store: &SkillStore, project_path: &std::path::Path) {
    store
        .insert_project(&ProjectRecord {
            id: "proj-1".to_string(),
            name: "proj-1".to_string(),
            path: project_path.to_string_lossy().to_string(),
            workspace_type: "project".to_string(),
            linked_agent_key: None,
            linked_agent_name: None,
            disabled_path: None,
            sort_order: 0,
            created_at: 0,
            updated_at: 0,
            visited_at: None,
        })
        .unwrap();
}

#[test]
fn non_linked_project_skips_empty_skill_dirs() {
    let tmp = tempdir().unwrap();
    let db_path = tmp.path().join("watcher.db");
    let project_path = tmp.path().join("proj");
    let skills_dir = project_path.join(".codex").join("skills");
    let disabled_dir = project_path.join(".codex").join("skills-disabled");
    let agent_dir = project_path.join(".codex");
    fs::create_dir_all(&skills_dir).unwrap();
    fs::create_dir_all(&disabled_dir).unwrap();

    let store = SkillStore::new(&db_path).unwrap();
    insert_non_linked_project(&store, &project_path);

    let paths = collect_watch_paths(&store);
    assert!(!paths.contains(&skills_dir), "empty skills dir watched");
    assert!(!paths.contains(&disabled_dir), "empty disabled dir watched");
    assert!(!paths.contains(&agent_dir), "agent parent dir watched");
}

#[test]
fn non_linked_project_skips_missing_skill_dirs() {
    let tmp = tempdir().unwrap();
    let db_path = tmp.path().join("watcher.db");
    let project_path = tmp.path().join("proj");
    fs::create_dir_all(&project_path).unwrap();
    let skills_dir = project_path.join(".codex").join("skills");
    let agent_dir = project_path.join(".codex");

    let store = SkillStore::new(&db_path).unwrap();
    insert_non_linked_project(&store, &project_path);

    let paths = collect_watch_paths(&store);
    assert!(!paths.contains(&skills_dir));
    assert!(!paths.contains(&agent_dir));
}

#[test]
fn non_linked_project_watches_non_empty_skill_dirs() {
    let tmp = tempdir().unwrap();
    let db_path = tmp.path().join("watcher.db");
    let project_path = tmp.path().join("proj");
    let skills_dir = project_path.join(".codex").join("skills");
    let agent_dir = project_path.join(".codex");
    fs::create_dir_all(skills_dir.join("hello")).unwrap();
    fs::write(
        skills_dir.join("hello").join("SKILL.md"),
        "---\nname: hello\n---\n",
    )
    .unwrap();

    let store = SkillStore::new(&db_path).unwrap();
    insert_non_linked_project(&store, &project_path);

    let paths = collect_watch_paths(&store);
    assert!(
        paths.contains(&skills_dir),
        "non-empty skills dir not watched"
    );
    assert!(!paths.contains(&agent_dir), "agent parent dir watched");
}
