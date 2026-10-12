import type { ManagedSkill } from "./tauri";
import { matchesSkillSearch } from "./skillSearch";
import { UNTAGGED_FILTER } from "./skillTags";
import { canRefreshSkill } from "./skillUpdatePresentation";

export type DeploymentFilter = "all" | "deployed" | "undeployed";
export type MembershipFilter = "all" | "enabled" | "available";

export interface SkillLibraryFilterState {
  search: string;
  sources: Set<string>;
  tags: Set<string>;
  ungrouped: boolean;
  deployment: DeploymentFilter;
  membership: MembershipFilter;
}

export function skillLibraryDisplayNames(skills: ManagedSkill[]) {
  const counts = new Map<string, number>();
  for (const skill of skills) {
    counts.set(skill.name, (counts.get(skill.name) ?? 0) + 1);
  }
  return new Map(
    skills.map((skill) => {
      const dir = skill.central_path.split(/[\\/]/).filter(Boolean).pop();
      return [
        skill.id,
        (counts.get(skill.name) ?? 0) > 1 && dir ? dir : skill.name,
      ];
    }),
  );
}

export function matchesDeployment(skill: ManagedSkill, mode: DeploymentFilter) {
  return mode === "all" || skill.targets.length > 0 === (mode === "deployed");
}

function matchesMembership(
  skill: ManagedSkill,
  mode: MembershipFilter,
  groupId?: string,
) {
  return (
    !groupId ||
    mode === "all" ||
    skill.skill_group_ids.includes(groupId) === (mode === "enabled")
  );
}

function matchesLibraryMetadata(
  skill: ManagedSkill,
  names: Map<string, string>,
  state: SkillLibraryFilterState,
  viewingUngrouped: boolean,
) {
  if (
    !matchesSkillSearch(
      skill.name,
      names.get(skill.id) ?? skill.name,
      skill.description,
      state.search,
    )
  )
    return false;
  if (state.sources.size > 0 && !state.sources.has(skill.source_type))
    return false;
  if ((state.ungrouped || viewingUngrouped) && skill.skill_group_ids.length > 0)
    return false;
  return (
    state.tags.size === 0 ||
    skill.tags.some((tag) => state.tags.has(tag)) ||
    (state.tags.has(UNTAGGED_FILTER) && skill.tags.length === 0)
  );
}

function compareLibrarySkills(
  a: ManagedSkill,
  b: ManagedSkill,
  groupId: string | undefined,
  order: string[],
) {
  const aUpdate = a.update_status === "update_available" && canRefreshSkill(a);
  const bUpdate = b.update_status === "update_available" && canRefreshSkill(b);
  if (aUpdate !== bUpdate) return aUpdate ? -1 : 1;
  if (!groupId) return 0;
  const aEnabled = a.skill_group_ids.includes(groupId);
  const bEnabled = b.skill_group_ids.includes(groupId);
  if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
  const aOrder = order.indexOf(a.id);
  const bOrder = order.indexOf(b.id);
  if (aOrder !== -1 && bOrder !== -1) return aOrder - bOrder;
  if (aOrder !== -1) return -1;
  if (bOrder !== -1) return 1;
  return a.name.localeCompare(b.name);
}

/** Counts ignore their own dimension so every choice shows its prospective result. */
export function filterSkillLibrary(
  skills: ManagedSkill[],
  names: Map<string, string>,
  state: SkillLibraryFilterState,
  groupId?: string,
  viewingUngrouped = false,
  order: string[] = [],
) {
  const base = skills.filter((skill) =>
    matchesLibraryMetadata(skill, names, state, viewingUngrouped),
  );
  const scope = base.filter((skill) =>
    matchesMembership(skill, state.membership, groupId),
  );
  const deployed = scope.filter((skill) => skill.targets.length > 0).length;
  const membershipScope = base.filter((skill) =>
    matchesDeployment(skill, state.deployment),
  );
  const enabled = groupId
    ? membershipScope.filter((skill) => skill.skill_group_ids.includes(groupId))
        .length
    : 0;
  const filtered = scope.filter((skill) =>
    matchesDeployment(skill, state.deployment),
  );
  filtered.sort((a, b) => compareLibrarySkills(a, b, groupId, order));
  return {
    filtered,
    deploymentCounts: {
      all: scope.length,
      deployed,
      undeployed: scope.length - deployed,
    },
    membershipCounts: {
      all: membershipScope.length,
      enabled,
      available: membershipScope.length - enabled,
    },
  };
}
