import type { ManagedSkill, SkillGroup } from "./tauri";

export type SkillGroupStatus = "active" | "partial" | "inactive" | "empty";

export interface SkillGroupStatusResult {
  status: SkillGroupStatus;
  installed: number;
  total: number;
}

/** Granularity of the skillGroup status tally. */
export type SkillGroupStatusMode = "agent-pair" | "logical-skill";

/** How much of a skillGroup is installed in the current workspace. */
export function computeSkillGroupStatus(
  skillGroup: SkillGroup,
  skills: ManagedSkill[],
  agentKeys: string[],
  existsInWorkspace: (skill: ManagedSkill, agentKey: string) => boolean,
  mode: SkillGroupStatusMode = "agent-pair",
): SkillGroupStatusResult {
  const skillGroupSkills = skills.filter((s) => s.skill_group_ids.includes(skillGroup.id));
  if (skillGroupSkills.length === 0 || agentKeys.length === 0) {
    return { status: "empty", installed: 0, total: 0 };
  }
  if (mode === "logical-skill") {
    const total = skillGroupSkills.length;
    let installed = 0;
    let anyCopy = false;
    for (const skill of skillGroupSkills) {
      const deployed = agentKeys.filter((agentKey) =>
        existsInWorkspace(skill, agentKey),
      ).length;
      if (deployed > 0) anyCopy = true;
      if (deployed === agentKeys.length) installed++;
    }
    if (installed === total) return { status: "active", installed, total };
    // A skill that reached some of the project's agents but not all of them
    // is not installed — but it is not absent either. Reporting it inactive
    // would hide a half-applied skillGroup behind the same grey pill as one that
    // was never applied at all.
    if (!anyCopy) return { status: "inactive", installed, total };
    return { status: "partial", installed, total };
  }

  const total = skillGroupSkills.length * agentKeys.length;
  let installed = 0;
  for (const skill of skillGroupSkills) {
    for (const agentKey of agentKeys) {
      if (existsInWorkspace(skill, agentKey)) installed++;
    }
  }
  if (installed === total) return { status: "active", installed, total };
  if (installed === 0) return { status: "inactive", installed, total };
  return { status: "partial", installed, total };
}
