import type { ProjectLibraryStatus, ProjectSkill } from "./tauri";

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
  teamStatus?: ProjectLibraryStatus["skills"][number];
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

function getGroupStatus(variants: ProjectSkill[]): ProjectSkill["sync_status"] {
  const priority: ProjectSkill["sync_status"][] = [
    "diverged",
    "project_newer",
    "center_newer",
    "project_only",
    "in_sync",
  ];
  for (const status of priority) {
    if (variants.some((variant) => variant.sync_status === status)) {
      return status;
    }
  }
  return "project_only";
}

export function needsTeamRefresh(
  status: ProjectLibraryStatus["skills"][number] | undefined,
) {
  return !!status && (status.modified || status.stale_targets.length > 0);
}

function needsAttention(skill: ProjectSkillEntry) {
  return (
    needsTeamRefresh(skill.teamStatus) ||
    ["diverged", "project_newer", "center_newer"].includes(skill.status)
  );
}

/** Group native variants by directory and put actionable entries first. */
export function groupProjectSkills(
  skills: ProjectSkill[],
  library: ProjectLibraryStatus | null,
): ProjectSkillEntry[] {
  const teamByDirectory = new Map(
    library?.skills.map((skill) => [skill.directory.toLowerCase(), skill]),
  );
  const groups = new Map<string, ProjectSkillEntry>();
  for (const skill of skills) {
    const key = skill.relative_path.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.variants.push(skill);
      existing.enabledCount += skill.enabled ? 1 : 0;
      existing.totalCount += 1;
      existing.files = Array.from(
        new Set([...existing.files, ...skill.files]),
      ).sort();
      existing.tags = Array.from(
        new Set([...existing.tags, ...skill.tags]),
      ).sort((a, b) => a.localeCompare(b));
      if (
        skill.center_skill_id &&
        !existing.centerSkillIds.includes(skill.center_skill_id)
      ) {
        existing.centerSkillIds.push(skill.center_skill_id);
        existing.centerSkillIds.sort((a, b) => a.localeCompare(b));
      }
      if (!existing.description && skill.description) {
        existing.description = skill.description;
      }
      continue;
    }
    groups.set(key, {
      id: key,
      name: skill.name,
      dir_name: skill.dir_name,
      relative_path: skill.relative_path,
      description: skill.description,
      files: [...skill.files],
      variants: [skill],
      enabledCount: skill.enabled ? 1 : 0,
      totalCount: 1,
      primaryVariant: skill,
      status: skill.sync_status,
      tags: [...skill.tags].sort((a, b) => a.localeCompare(b)),
      centerSkillIds: skill.center_skill_id ? [skill.center_skill_id] : [],
      teamStatus: teamByDirectory.get(key),
    });
  }
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      variants: [...group.variants].sort((a, b) =>
        a.agent_display_name.localeCompare(b.agent_display_name),
      ),
      primaryVariant: [...group.variants].sort((a, b) =>
        a.agent_display_name.localeCompare(b.agent_display_name),
      )[0],
      status: getGroupStatus(group.variants),
    }))
    .sort((a, b) => {
      // Put skills that need attention ahead of the clean list. This keeps
      // project workspaces useful as a review queue while preserving the
      // stable alphabetical order within each sync state.
      const statusRank: Record<ProjectSkill["sync_status"], number> = {
        diverged: 0,
        project_newer: 1,
        center_newer: 2,
        project_only: 3,
        in_sync: 4,
      };
      return (
        Number(needsAttention(b)) - Number(needsAttention(a)) ||
        statusRank[a.status] - statusRank[b.status] ||
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      );
    });
}
