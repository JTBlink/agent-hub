import type { ManagedSkill } from "./tauri";

/** Patch membership after a database read without reloading Skill files/targets. */
export function withSkillGroupMembership<
  T extends Pick<ManagedSkill, "id" | "skill_group_ids">,
>(skills: T[], groupId: string, memberIds: string[]): T[] {
  const members = new Set(memberIds);
  let changed = false;
  const next = skills.map((skill) => {
    const included = members.has(skill.id);
    if (skill.skill_group_ids.includes(groupId) === included) return skill;
    changed = true;
    return {
      ...skill,
      skill_group_ids: included
        ? [groupId]
        : skill.skill_group_ids.filter((id) => id !== groupId),
    };
  });
  return changed ? next : skills;
}

/** Group-only changes cannot affect file contents or project health. */
export function skillLibraryContentKey(skills: readonly object[]): string {
  return JSON.stringify(skills, (key, value: unknown) =>
    key === "skill_group_ids" ? undefined : value,
  );
}
