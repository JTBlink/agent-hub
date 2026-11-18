use super::*;

#[test]
fn names_configuration_types_and_suppresses_a_redundant_schema_marker() {
    assert_eq!(build_auto_commit_message(" M user-config/agent-launch.json\n M user-config/schema.json\n M user-config/hosts/profiles/demo.json\n"), "auto backup: user-config/agent-launch, user-config/hosts");
}

#[test]
fn names_skill_metadata_groups_and_memberships_without_opaque_ids() {
    assert_eq!(build_auto_commit_message(" M .agent-hub/skills/id.json\n M .agent-hub/scenarios/id.json\n M .agent-hub/scenario-skills/id/member.json\n"), "auto backup: metadata/group-memberships, metadata/skill-groups, metadata/skills");
}

#[test]
fn bounds_mixed_scope_messages_and_keeps_unknown_metadata_as_a_fallback() {
    let status = " M skills/a/SKILL.md\n M skills/b/SKILL.md\n M skills/c/SKILL.md\n M user-config/agent-launch.json\n M user-config/hosts/demo.json\n M .agent-hub/scenarios/id.json\n M .agent-hub/unknown.json\n";
    assert_eq!(
        build_auto_commit_message(status),
        "auto backup: a, b, c, user-config/agent-launch, user-config/hosts, metadata (+1 more)"
    );
}

#[test]
fn classifies_quoted_configuration_paths_and_renames() {
    assert_eq!(build_auto_commit_message("R  user-config/old.json -> user-config/agent-launch.json\n M \"user-config/hosts/profile with spaces.json\"\n"), "auto backup: user-config/agent-launch, user-config/hosts");
}
