import type { SkillGroup } from "../../src/lib/tauri";

export function makeSkillGroup(id: string, name: string): SkillGroup {
  return {
    id,
    name,
    description: null,
    icon: null,
    sort_order: 0,
    skill_count: 0,
    created_at: 1,
    updated_at: 1,
  };
}
