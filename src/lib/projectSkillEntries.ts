import type { ProjectSkill } from "./tauri";

export interface ProjectSkillEntry {
  id: string;
  name: string;
  dir_name: string;
  relative_path: string;
  description: string | null;
  files: string[];
  variants: ProjectSkill[];
  enabledCount: number;
  totalCount: number;
  primaryVariant: ProjectSkill;
  status: ProjectSkill["sync_status"];
  tags: string[];
  centerSkillIds: string[];
}

export function getAssignedAgents(variants: ProjectSkill[]) {
  return Array.from(new Set(variants.map((variant) => variant.agent))).sort();
}

export function getAgentDotTargets(variants: ProjectSkill[]) {
  const seen = new Set<string>();
  const targets: { key: string; display_name: string }[] = [];
  for (const v of variants) {
    if (!seen.has(v.agent)) {
      seen.add(v.agent);
      targets.push({ key: v.agent, display_name: v.agent_display_name });
    }
  }
  return targets;
}

export function getProjectSkillStatusMeta(
  t: (key: string) => string,
  status: ProjectSkill["sync_status"],
) {
  switch (status) {
    case "in_sync":
      return {
        label: t("project.syncStatus.inSync"),
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      };
    case "project_newer":
      return {
        label: t("project.syncStatus.projectNewer"),
        className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    case "center_newer":
      return {
        label: t("project.syncStatus.centerNewer"),
        className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
      };
    case "diverged":
      return {
        label: t("project.syncStatus.diverged"),
        className: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
      };
    default:
      return {
        label: t("project.syncStatus.projectOnly"),
        className: "bg-surface-hover text-muted",
      };
  }
}
