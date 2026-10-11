import type { TFunction } from "i18next";
import type { ManagedSkill, ProjectSkill, SkillGroup } from "./tauri";
import { getSkillGroupDisplayName } from "./skillGroupDisplay";

export function getLocalStatusMeta(
  t: (key: string) => string,
  status: ProjectSkill["sync_status"],
) {
  switch (status) {
    case "in_sync":
      return {
        label: t("globalWorkspace.localSkills.status.inSync"),
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      };
    case "project_newer":
      return {
        label: t("globalWorkspace.localSkills.status.localNewer"),
        className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    case "center_newer":
      return {
        label: t("globalWorkspace.localSkills.status.centerNewer"),
        className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
      };
    case "diverged":
      return {
        label: t("globalWorkspace.localSkills.status.diverged"),
        className: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
      };
    default:
      return {
        label: t("globalWorkspace.localSkills.status.localOnly"),
        className: "bg-surface-hover text-muted",
      };
  }
}

/** Show group membership in place of the healthy sync label on workspace cards. */
export function getWorkspaceSkillCardStatus(
  t: TFunction,
  skill: Pick<ProjectSkill, "sync_status" | "center_skill_id">,
  managedSkills: ReadonlyMap<string, Pick<ManagedSkill, "skill_group_ids">>,
  skillGroups: ReadonlyMap<string, Pick<SkillGroup, "name">>,
) {
  const status = getLocalStatusMeta(t, skill.sync_status);
  if (skill.sync_status !== "in_sync" || !skill.center_skill_id) return status;
  const managedSkill = managedSkills.get(skill.center_skill_id);
  if (!managedSkill) return status;
  const groupId = managedSkill.skill_group_ids[0];
  const group = groupId ? skillGroups.get(groupId) : undefined;
  if (groupId && !group) return status;
  return {
    label: group
      ? getSkillGroupDisplayName(group.name, t)
      : t("mySkills.sourceFilter.ungrouped"),
    className: "bg-accent-bg text-accent-light",
  };
}
