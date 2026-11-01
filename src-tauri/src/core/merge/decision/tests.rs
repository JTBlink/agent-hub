use super::*;
use crate::core::sync_metadata::SourceMeta;

fn oid(n: u8) -> git2::Oid {
    git2::Oid::from_str(&format!("{:040x}", n)).unwrap()
}

fn skill(id: &str, path: &str, content: u8, enabled: bool, tags: &[&str]) -> SkillObj {
    SkillObj {
        meta_entry: FileEntry {
            oid: oid(0),
            mode: 0o100644,
        },
        meta: SkillMetaFile {
            schema_version: 1,
            skill_id: id.to_string(),
            path: path.to_string(),
            path_key: path_key(path),
            enabled,
            tags: tags.iter().map(|s| s.to_string()).collect(),
            source: SourceMeta {
                source_type: "import".to_string(),
                ref_: None,
                subpath: None,
                branch: None,
            },
        },
        content: Some(oid(content)),
    }
}

fn snap(skills: Vec<SkillObj>) -> Snapshot {
    let mut s = Snapshot::default();
    for obj in skills {
        s.skills.insert(obj.meta.skill_id.clone(), obj);
    }
    s
}

fn decide_simple(base: &Snapshot, ours: &Snapshot, theirs: &Snapshot) -> MergePlan {
    let pinned = BTreeMap::new();
    let empty = BTreeMap::new();
    decide(&DecisionInput {
        base,
        ours,
        theirs,
        pinned: &pinned,
        ours_touch: &empty,
        theirs_touch: &empty,
    })
    .unwrap()
}

// ── object-level table (§3, all nine populated branches) ──

#[test]
fn object_level_add_and_delete_branches() {
    let base = snap(vec![skill("del-both", "a", 1, true, &[])]);
    let ours = snap(vec![skill("only-ours", "b", 2, true, &[])]);
    let theirs = snap(vec![skill("only-theirs", "c", 3, true, &[])]);
    let plan = decide_simple(&base, &ours, &theirs);
    assert!(plan.skills.contains_key("only-ours"));
    assert!(plan.skills.contains_key("only-theirs"));
    assert!(!plan.skills.contains_key("del-both"));
    assert!(plan.new_conflicts.is_empty());
    assert_eq!(plan.updated_from_theirs, vec!["only-theirs"]);
}

#[test]
fn double_add_identical_takes_one_divergent_conflicts() {
    let base = snap(vec![]);
    let same_o = skill("same", "s", 1, true, &[]);
    let same_t = skill("same", "s", 1, true, &[]);
    let div_o = skill("div", "d", 1, true, &[]);
    let div_t = skill("div", "d", 2, true, &[]);
    let ours = snap(vec![same_o, div_o]);
    let theirs = snap(vec![same_t, div_t]);
    let plan = decide_simple(&base, &ours, &theirs);
    assert!(plan.skills.contains_key("same"));
    // divergent double-add keeps ours and declares a conflict
    assert_eq!(plan.skills["div"].content, Some(oid(1)));
    assert_eq!(plan.new_conflicts.len(), 1);
    assert_eq!(plan.new_conflicts[0].skill_id, "div");
    assert_eq!(plan.kept_local, vec!["div"]);
}

#[test]
fn deletion_propagates_only_when_other_side_unchanged() {
    let base = snap(vec![
        skill("clean-del", "a", 1, true, &[]),
        skill("del-vs-edit", "b", 2, true, &[]),
        skill("edit-vs-del", "c", 3, true, &[]),
    ]);
    // ours deleted clean-del and del-vs-edit; edited edit-vs-del
    let ours = snap(vec![skill("edit-vs-del", "c", 4, true, &[])]);
    // theirs kept clean-del as base (deletion propagates), edited
    // del-vs-edit (conflict), deleted edit-vs-del (conflict)
    let theirs = snap(vec![
        skill("clean-del", "a", 1, true, &[]),
        skill("del-vs-edit", "b", 9, true, &[]),
    ]);
    let plan = decide_simple(&base, &ours, &theirs);
    assert!(!plan.skills.contains_key("clean-del"));
    // del-vs-edit: ours deletion kept, conflict declared with theirs path
    assert!(!plan.skills.contains_key("del-vs-edit"));
    // edit-vs-del: ours edit kept, conflict declared
    assert_eq!(plan.skills["edit-vs-del"].content, Some(oid(4)));
    let mut conflicted: Vec<&str> = plan
        .new_conflicts
        .iter()
        .map(|c| c.skill_id.as_str())
        .collect();
    conflicted.sort();
    assert_eq!(conflicted, vec!["del-vs-edit", "edit-vs-del"]);
}

// ── component-level (§3 组件级) ──

#[test]
fn content_edit_plus_rename_compose() {
    let base = snap(vec![skill("s", "old-name", 1, true, &["x"])]);
    let ours = snap(vec![skill("s", "old-name", 2, true, &["x"])]); // content edit
    let theirs = snap(vec![skill("s", "new-name", 1, true, &["x"])]); // rename
    let plan = decide_simple(&base, &ours, &theirs);
    let s = &plan.skills["s"];
    assert_eq!(s.content, Some(oid(2)));
    assert_eq!(s.meta.path, "new-name");
    assert_eq!(s.meta.path_key, path_key("new-name"));
    assert!(plan.new_conflicts.is_empty());
    assert_eq!(plan.updated_from_theirs, vec!["s"]);
}

#[test]
fn attrs_move_as_one_component() {
    let base = snap(vec![skill("s", "p", 1, true, &["a"])]);
    // ours toggles enabled; theirs edits tags → same component both
    // changed, unequal → whole-skill conflict, ours kept.
    let ours = snap(vec![skill("s", "p", 1, false, &["a"])]);
    let theirs = snap(vec![skill("s", "p", 1, true, &["a", "b"])]);
    let plan = decide_simple(&base, &ours, &theirs);
    assert!(!plan.skills["s"].meta.enabled);
    assert_eq!(plan.new_conflicts.len(), 1);
}

#[test]
fn same_component_equal_change_is_not_conflict() {
    let base = snap(vec![skill("s", "p", 1, true, &[])]);
    let ours = snap(vec![skill("s", "p", 2, true, &[])]);
    let theirs = snap(vec![skill("s", "p", 2, true, &[])]);
    let plan = decide_simple(&base, &ours, &theirs);
    assert_eq!(plan.skills["s"].content, Some(oid(2)));
    assert!(plan.new_conflicts.is_empty());
    assert!(plan.updated_from_theirs.is_empty());
}

#[test]
fn both_content_changed_unequal_conflicts_and_keeps_ours() {
    let base = snap(vec![skill("s", "p", 1, true, &[])]);
    let ours = snap(vec![skill("s", "p", 2, true, &[])]);
    let theirs = snap(vec![skill("s", "p", 3, true, &[])]);
    let plan = decide_simple(&base, &ours, &theirs);
    assert_eq!(plan.skills["s"].content, Some(oid(2)));
    assert_eq!(plan.new_conflicts.len(), 1);
    assert_eq!(plan.new_conflicts[0].theirs_path.as_deref(), Some("p"));
}

// ── pinned pendings (§4) ──

#[test]
fn pinned_skill_bypasses_decision_and_keeps_pin_side() {
    let base = snap(vec![skill("s", "p", 1, true, &[])]);
    let ours = snap(vec![skill("s", "p", 2, true, &[])]);
    let theirs = snap(vec![skill("s", "p", 3, true, &[])]);
    let mut pinned = BTreeMap::new();
    pinned.insert("s".to_string(), Side::Theirs);
    let empty = BTreeMap::new();
    let plan = decide(&DecisionInput {
        base: &base,
        ours: &ours,
        theirs: &theirs,
        pinned: &pinned,
        ours_touch: &empty,
        theirs_touch: &empty,
    })
    .unwrap();
    assert_eq!(plan.skills["s"].content, Some(oid(3)));
    assert!(plan.new_conflicts.is_empty());
    assert_eq!(plan.still_pending, vec!["s"]);
}

// ── whole-file newest-wins ──

#[test]
fn whole_file_double_edit_newest_wins() {
    let entry = |n: u8| FileEntry {
        oid: oid(n),
        mode: 0o100644,
    };
    let mut base = Snapshot::default();
    let mut ours = Snapshot::default();
    let mut theirs = Snapshot::default();
    base.scenarios.insert("sc".into(), entry(1));
    ours.scenarios.insert("sc".into(), entry(2));
    theirs.scenarios.insert("sc".into(), entry(3));

    let path = format!("{}/scenarios/sc.json", super::super::snapshot::METADATA_DIR);
    let mut ours_touch = BTreeMap::new();
    let mut theirs_touch = BTreeMap::new();
    ours_touch.insert(path.clone(), (100, "aaa".to_string()));
    theirs_touch.insert(path.clone(), (200, "bbb".to_string()));

    let pinned = BTreeMap::new();
    let plan = decide(&DecisionInput {
        base: &base,
        ours: &ours,
        theirs: &theirs,
        pinned: &pinned,
        ours_touch: &ours_touch,
        theirs_touch: &theirs_touch,
    })
    .unwrap();
    assert_eq!(plan.scenarios["sc"], entry(3));

    // Flip the clock: ours newer → ours wins.
    ours_touch.insert(path.clone(), (300, "aaa".to_string()));
    let plan = decide(&DecisionInput {
        base: &base,
        ours: &ours,
        theirs: &theirs,
        pinned: &pinned,
        ours_touch: &ours_touch,
        theirs_touch: &theirs_touch,
    })
    .unwrap();
    assert_eq!(plan.scenarios["sc"], entry(2));
}

#[test]
fn membership_orphans_are_dropped() {
    let entry = FileEntry {
        oid: oid(9),
        mode: 0o100644,
    };
    let mut theirs = Snapshot::default();
    theirs
        .memberships
        .insert(("sc".to_string(), "missing-skill".to_string()), entry);
    let base = Snapshot::default();
    let ours = Snapshot::default();
    let plan = decide_simple(&base, &ours, &theirs);
    assert!(plan.memberships.is_empty());
}

// ── path collisions (§3 碰撞) ──

#[test]
fn collision_base_holder_stays_migrant_moves() {
    // base holder keeps the key even with a larger skill_id.
    let base = snap(vec![skill("z-holder", "spot", 1, true, &[])]);
    let ours = snap(vec![skill("z-holder", "spot", 1, true, &[])]);
    let theirs = snap(vec![
        skill("z-holder", "spot", 1, true, &[]),
        skill("a-migrant", "Spot", 2, true, &[]), // folds to same key
    ]);
    let plan = decide_simple(&base, &ours, &theirs);
    assert_eq!(plan.skills["z-holder"].meta.path, "spot");
    assert_eq!(plan.skills["a-migrant"].meta.path, "Spot (2)");
    assert!(plan.skills["a-migrant"].renamed_for_collision);
    assert_eq!(plan.skills["a-migrant"].meta.path_key, path_key("Spot (2)"));
}

#[test]
fn collision_double_add_smallest_id_stays() {
    let base = snap(vec![]);
    let ours = snap(vec![skill("bbb", "dir/nAme", 1, true, &[])]);
    let theirs = snap(vec![skill("aaa", "dir/name", 2, true, &[])]);
    let plan = decide_simple(&base, &ours, &theirs);
    assert_eq!(plan.skills["aaa"].meta.path, "dir/name");
    assert_eq!(plan.skills["bbb"].meta.path, "dir/nAme (2)");
}

#[test]
fn collision_pending_placeholder_beats_base_holder() {
    // Pending skill (declared, pinned) occupies the key; even the base
    // holder must yield (§3 rule 1 — pending outranks base).
    let base = snap(vec![skill("holder", "spot", 1, true, &[])]);
    let ours = snap(vec![skill("holder", "spot", 1, true, &[])]);
    let theirs = snap(vec![
        skill("holder", "spot", 1, true, &[]),
        skill("pending-skill", "SPOT", 5, true, &[]),
    ]);
    let mut pinned = BTreeMap::new();
    pinned.insert("pending-skill".to_string(), Side::Theirs);
    let empty = BTreeMap::new();
    let plan = decide(&DecisionInput {
        base: &base,
        ours: &ours,
        theirs: &theirs,
        pinned: &pinned,
        ours_touch: &empty,
        theirs_touch: &empty,
    })
    .unwrap();
    assert_eq!(plan.skills["pending-skill"].meta.path, "SPOT");
    assert_eq!(plan.skills["holder"].meta.path, "spot (2)");
}

#[test]
fn collision_two_pendings_abort() {
    let base = snap(vec![]);
    let ours = snap(vec![skill("p1", "spot", 1, true, &[])]);
    let theirs = snap(vec![skill("p2", "SPOT", 2, true, &[])]);
    let mut pinned = BTreeMap::new();
    pinned.insert("p1".to_string(), Side::Ours);
    pinned.insert("p2".to_string(), Side::Theirs);
    let empty = BTreeMap::new();
    let err = decide(&DecisionInput {
        base: &base,
        ours: &ours,
        theirs: &theirs,
        pinned: &pinned,
        ours_touch: &empty,
        theirs_touch: &empty,
    })
    .unwrap_err();
    assert!(err.to_string().contains("pending"));
}

#[test]
fn collision_rename_chain_finds_free_slot() {
    let base = snap(vec![skill("keeper", "n", 1, true, &[])]);
    let ours = snap(vec![
        skill("keeper", "n", 1, true, &[]),
        skill("aaa", "n (2)", 2, true, &[]),
    ]);
    let theirs = snap(vec![
        skill("keeper", "n", 1, true, &[]),
        skill("zzz", "N", 3, true, &[]),
    ]);
    let plan = decide_simple(&base, &ours, &theirs);
    assert_eq!(plan.skills["keeper"].meta.path, "n");
    assert_eq!(plan.skills["aaa"].meta.path, "n (2)");
    // "n (2)" is taken, so the migrant lands on "N (3)"... wait — suffix
    // applies to its own name "N": "N (2)" folds to occupied "n (2)" →
    // next free is "N (3)".
    assert_eq!(plan.skills["zzz"].meta.path, "N (3)");
}
