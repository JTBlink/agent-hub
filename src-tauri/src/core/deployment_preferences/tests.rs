use super::*;

#[test]
fn legacy_scope_preferences_survive_until_unified_default_is_selected() {
    let temp = tempfile::tempdir().unwrap();
    let store = SkillStore::new(&temp.path().join("test.db")).unwrap();
    store.set_setting("sync_mode", "copy").unwrap();
    store.set_setting("project_sync_mode", "symlink").unwrap();
    assert_eq!(
        Preference::load(&store, Scope::Global)
            .unwrap()
            .for_install(None)
            .as_str(),
        "copy"
    );
    assert_eq!(
        Preference::load(&store, Scope::Linked)
            .unwrap()
            .for_install(None)
            .as_str(),
        "symlink"
    );
    assert_eq!(
        Preference::load(&store, Scope::Project)
            .unwrap()
            .for_install(None)
            .as_str(),
        "symlink"
    );
    store.set_setting(SETTING, "copy").unwrap();
    for scope in [Scope::Global, Scope::Linked, Scope::Project] {
        let preference = Preference::load(&store, scope).unwrap();
        assert_eq!(preference.for_install(None).as_str(), "copy");
        assert_eq!(preference.for_install(Some(false)).as_str(), "symlink");
        assert_eq!(preference.for_target(Some("symlink")).as_str(), "symlink");
    }
    assert_eq!(
        store.get_setting("project_sync_mode").unwrap().as_deref(),
        Some("symlink")
    );
}

#[test]
fn fresh_and_invalid_preferences_default_to_links_with_explicit_copy_override() {
    let temp = tempfile::tempdir().unwrap();
    let store = SkillStore::new(&temp.path().join("test.db")).unwrap();
    store.set_setting(SETTING, "invalid").unwrap();
    for scope in [Scope::Global, Scope::Linked, Scope::Project] {
        let preference = Preference::load(&store, scope).unwrap();
        assert_eq!(preference.for_install(None).as_str(), "symlink");
        assert_eq!(preference.for_install(Some(true)).as_str(), "copy");
    }
    store.set_setting(SETTING, "symlink").unwrap();
    assert_eq!(
        Preference::load(&store, Scope::Global)
            .unwrap()
            .for_target(Some("copy"))
            .as_str(),
        "copy"
    );
}
