import type { ManagedSkill } from "./tauri";

type UpdateSkill = Pick<
  ManagedSkill,
  "source_type" | "source_ref" | "update_status"
>;

export function isLocalSkillSource(skill: Pick<ManagedSkill, "source_type">) {
  return skill.source_type === "local" || skill.source_type === "import";
}

/** Missing import provenance is not a library or deployment error. */
export function skillUpdateBadge(
  skill: Pick<ManagedSkill, "update_status">,
  t: (key: string) => string,
) {
  if (skill.update_status === "central_newer") {
    return {
      label: t("mySkills.updateStatus.centralNewer"),
      className: "bg-accent/10 text-accent-light",
    };
  }
  if (skill.update_status === "update_available") {
    return {
      label: "Update",
      className: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    };
  }
  if (skill.update_status === "error") {
    return {
      label: t("mySkills.updateStatus.error"),
      className: "bg-red-500/10 text-red-600 dark:text-red-300",
    };
  }
  return null;
}

export function canRefreshSkill(skill: UpdateSkill) {
  return (
    skill.source_type === "git" ||
    skill.source_type === "skillssh" ||
    (isLocalSkillSource(skill) &&
      !!skill.source_ref &&
      skill.update_status !== "source_missing")
  );
}

/** Comparing with the source remains available when applying it would downgrade. */
export function canApplySkillSource(skill: UpdateSkill) {
  return skill.update_status !== "central_newer" && canRefreshSkill(skill);
}

export function skillRefreshMessage(
  skill: Pick<ManagedSkill, "update_status" | "source_type">,
  changed = true,
) {
  if (skill.update_status === "central_newer")
    return "mySkills.updateActions.keptNewer";
  if (isLocalSkillSource(skill)) return "mySkills.updateActions.reimported";
  return changed
    ? "mySkills.updateActions.updated"
    : "mySkills.updateActions.alreadyUpToDate";
}
