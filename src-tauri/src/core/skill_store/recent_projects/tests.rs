use super::*;

#[test]
fn prunes_legacy_history_and_reopens_evicted_projects_without_deleting_registrations() {
    let temp = tempfile::tempdir().unwrap();
    let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
    for index in 1..=17 {
        store
            .insert_project(&ProjectRecord {
                id: format!("project-{index:02}"),
                name: format!("Project {index}"),
                path: format!("/workspace/project-{index}"),
                workspace_type: "project".into(),
                linked_agent_key: None,
                linked_agent_name: None,
                disabled_path: None,
                sort_order: 0,
                created_at: index,
                updated_at: index,
                visited_at: None,
            })
            .unwrap();
    }
    store.prune_recent_projects().unwrap();
    let records = store.get_all_projects().unwrap();
    assert_eq!(records.len(), 17);
    assert_eq!(
        records.iter().filter(|p| p.visited_at != Some(0)).count(),
        15
    );
    assert_eq!(
        store
            .get_project_by_id("project-01")
            .unwrap()
            .unwrap()
            .visited_at,
        Some(0)
    );
    store.touch_project_visited("project-01").unwrap();
    let first = store
        .get_project_by_id("project-01")
        .unwrap()
        .unwrap()
        .visited_at
        .unwrap();
    store.touch_project_visited("project-02").unwrap();
    let second = store
        .get_project_by_id("project-02")
        .unwrap()
        .unwrap()
        .visited_at
        .unwrap();
    assert!(second > first);
    assert_eq!(
        store
            .get_project_by_id("project-03")
            .unwrap()
            .unwrap()
            .visited_at,
        Some(0)
    );
    assert_eq!(
        store
            .get_project_by_id("project-04")
            .unwrap()
            .unwrap()
            .visited_at,
        Some(0)
    );
    drop(store);
    let reopened = SkillStore::new(&temp.path().join("store.db")).unwrap();
    let records = reopened.get_all_projects().unwrap();
    assert_eq!(records.len(), 17);
    assert_eq!(
        records.iter().filter(|p| p.visited_at != Some(0)).count(),
        15
    );
}
