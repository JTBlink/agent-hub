import type { ManagedSkill } from "../../src/lib/tauri";

export function makeSkill(index: number, deployed = false): ManagedSkill {
  return {
    id: `skill-${index}`,
    name: `demo-skill-${index}`,
    description: `Description ${index}`,
    central_path: `<workspace>/library/demo-skill-${index}`,
    source_type: "local",
    source_ref: null,
    source_ref_resolved: null,
    source_revision: null,
    remote_revision: null,
    updated_at: index,
    created_at: 1,
    version: null,
    source_subpath: null,
    source_branch: null,
    source_agent: null,
    last_checked_at: null,
    last_check_error: null,
    enabled: true,
    status: "active",
    targets: deployed
      ? [
          {
            id: `target-${index}`,
            skill_id: `skill-${index}`,
            tool: "codex",
            target_path: `<workspace>/agent/demo-skill-${index}`,
            mode: "symlink",
            status: "ok",
            synced_at: 1,
          },
        ]
      : [],
    update_status: "up_to_date",
    tags: [],
    skill_group_ids: ["demo-group"],
  };
}

/** A complete installed Skill fixture with explicit provenance overrides. */
export function createManagedSkill(
  overrides: Partial<ManagedSkill> = {},
): ManagedSkill {
  return { ...makeSkill(1), source_type: "git", ...overrides };
}
