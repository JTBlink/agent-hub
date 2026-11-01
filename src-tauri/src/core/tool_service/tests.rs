use super::*;
use tempfile::tempdir;

fn v(keys: &[&str]) -> Vec<String> {
    keys.iter().map(|s| s.to_string()).collect()
}

#[test]
fn fresh_install_uses_default_priority_order() {
    let all = v(&[
        "cursor",
        "claude_code",
        "omp_agent",
        "codex",
        "grok",
        "gemini_cli",
        "opencode",
    ]);
    let order = merge_order(&[], &all);
    // Priority list comes first, then remaining adapters in their natural order.
    assert_eq!(order[0], "claude_code");
    assert_eq!(order[1], "codex");
    assert_eq!(order[2], "cursor");
    // omp_agent is last in the priority list, so it sits behind every other
    // ranked agent rather than near the top.
    let opencode = order.iter().position(|k| k == "opencode").unwrap();
    let omp = order.iter().position(|k| k == "omp_agent").unwrap();
    assert!(omp > opencode);
}

#[test]
fn unranked_agents_follow_the_ranked_ones() {
    // `pochi` is not in DEFAULT_PRIORITY_ORDER, so it falls through to the
    // tail even though the adapter list happens to mention it first.
    let all = v(&["pochi", "claude_code", "cline"]);
    let order = merge_order(&[], &all);
    assert_eq!(order, v(&["claude_code", "cline", "pochi"]));
}

#[test]
fn new_priority_agent_slots_after_its_predecessor() {
    // Existing user whose saved order predates `cursor`, the agent ranked
    // immediately after `codex`.
    let saved = v(&["claude_code", "codex", "gemini_cli", "opencode"]);
    let all = v(&["claude_code", "codex", "cursor", "gemini_cli", "opencode"]);
    let order = merge_order(&saved, &all);
    let codex = order.iter().position(|k| k == "codex").unwrap();
    assert_eq!(
        order[codex + 1],
        "cursor",
        "cursor must land right after codex"
    );
    // Existing entries keep their relative order.
    assert!(
        order.iter().position(|k| k == "gemini_cli").unwrap()
            < order.iter().position(|k| k == "opencode").unwrap()
    );
}

#[test]
fn new_agent_anchors_to_its_ranked_predecessor_within_the_saved_order() {
    // A saved order the user has rearranged, so the ranked predecessor sits
    // somewhere other than where DEFAULT_PRIORITY_ORDER would put it.
    let saved = v(&[
        "claude_code",
        "codex",
        "grok",
        "gemini_cli",
        "cursor",
        "opencode",
    ]);
    let all = v(&[
        "cursor",
        "claude_code",
        "omp_agent",
        "codex",
        "grok",
        "gemini_cli",
        "opencode",
    ]);
    let order = merge_order(&saved, &all);
    let grok = order.iter().position(|k| k == "grok").unwrap();
    let omp_agent = order.iter().position(|k| k == "omp_agent").unwrap();
    let claude_code = order.iter().position(|k| k == "claude_code").unwrap();
    // omp_agent is last in DEFAULT_PRIORITY_ORDER, so its anchor is grok —
    // the last ranked agent ahead of it that this user has — and it lands
    // wherever *the user* put grok. That is deliberately not "after every
    // mainstream agent": gemini_cli, cursor and opencode follow grok in
    // this saved order, so omp_agent precedes them. The guarantee under
    // test is the anchoring, not an absolute position.
    assert_eq!(order[grok + 1], "omp_agent");
    assert!(
        omp_agent > claude_code + 1,
        "omp_agent must not sit right after claude_code"
    );
}

#[test]
fn non_priority_new_agent_appends_at_end() {
    let saved = v(&["claude_code", "codex"]);
    let all = v(&["claude_code", "codex", "some_new_tool"]);
    let order = merge_order(&saved, &all);
    assert_eq!(order.last().unwrap(), "some_new_tool");
}
#[test]
fn migrates_custom_omp_agent_to_builtin_overrides() {
    let tmp = tempdir().unwrap();
    let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
    let legacy_skills = tmp.path().join("legacy-skills");
    let explicit_skills = tmp.path().join("explicit-skills");

    set_custom_tools(
        &store,
        &[
            CustomToolDef {
                key: "omp_agent".to_string(),
                display_name: "Legacy Custom OMP".to_string(),
                skills_dir: legacy_skills.to_string_lossy().into_owned(),
                project_relative_skills_dir: Some(".legacy/skills".to_string()),
                category: ToolCategory::Lobster,
            },
            CustomToolDef {
                key: "custom_agent".to_string(),
                display_name: "Custom Agent".to_string(),
                skills_dir: tmp
                    .path()
                    .join("custom-skills")
                    .to_string_lossy()
                    .into_owned(),
                project_relative_skills_dir: Some(".custom/skills".to_string()),
                category: ToolCategory::Lobster,
            },
        ],
    )
    .unwrap();

    migrate_legacy_tool_keys(&store).unwrap();

    let customs = get_custom_tools(&store);
    assert!(!customs.iter().any(|custom| custom.key == "omp_agent"));
    assert!(customs.iter().any(|custom| custom.key == "custom_agent"));

    let custom_paths = get_custom_tool_paths(&store);
    assert_eq!(
        custom_paths.get("omp_agent"),
        Some(&legacy_skills.to_string_lossy().into_owned())
    );

    let project_paths = get_custom_tool_project_paths(&store);
    assert_eq!(
        project_paths.get("omp_agent"),
        Some(&".legacy/skills".to_string())
    );

    set_custom_tools(
        &store,
        &[CustomToolDef {
            key: "omp_agent".to_string(),
            display_name: "Legacy Custom OMP".to_string(),
            skills_dir: legacy_skills.to_string_lossy().into_owned(),
            project_relative_skills_dir: Some(".legacy/skills".to_string()),
            category: ToolCategory::Lobster,
        }],
    )
    .unwrap();
    set_custom_tool_paths(
        &store,
        &HashMap::from([(
            "omp_agent".to_string(),
            explicit_skills.to_string_lossy().into_owned(),
        )]),
    )
    .unwrap();
    set_custom_tool_project_paths(
        &store,
        &HashMap::from([("omp_agent".to_string(), ".explicit/skills".to_string())]),
    )
    .unwrap();

    migrate_legacy_tool_keys(&store).unwrap();

    let customs = get_custom_tools(&store);
    assert!(!customs.iter().any(|custom| custom.key == "omp_agent"));

    let custom_paths = get_custom_tool_paths(&store);
    assert_eq!(
        custom_paths.get("omp_agent"),
        Some(&explicit_skills.to_string_lossy().into_owned())
    );

    let project_paths = get_custom_tool_project_paths(&store);
    assert_eq!(
        project_paths.get("omp_agent"),
        Some(&".explicit/skills".to_string())
    );
}
