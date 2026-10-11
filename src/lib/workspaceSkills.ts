import type { ProjectSkill } from "./tauri";
import { UNTAGGED_FILTER } from "./skillTags";

export function isManagedWorkspaceSkill(
  skill: Pick<ProjectSkill, "center_skill_id">,
  managedIds: ReadonlySet<string>,
): boolean {
  return !!skill.center_skill_id && managedIds.has(skill.center_skill_id);
}

type FilterableSkill = Pick<
  ProjectSkill,
  | "name"
  | "dir_name"
  | "description"
  | "tags"
  | "center_skill_id"
  | "sync_status"
>;
const priority: Record<ProjectSkill["sync_status"], number> = {
  project_only: 0,
  project_newer: 1,
  diverged: 2,
  center_newer: 3,
  in_sync: 4,
};

export function filterWorkspaceSkills<T extends FilterableSkill>(
  skills: T[],
  search: string,
  tagFilters: ReadonlySet<string>,
  managedIds: ReadonlySet<string>,
  onlyUnmanaged: boolean,
): T[] {
  const query = search.trim().toLowerCase();
  return skills
    .filter((skill) => {
      if (onlyUnmanaged && isManagedWorkspaceSkill(skill, managedIds))
        return false;
      if (
        query &&
        ![skill.name, skill.dir_name, skill.description ?? ""].some((value) =>
          value.toLowerCase().includes(query),
        )
      )
        return false;
      if (tagFilters.size > 0) {
        const untagged =
          tagFilters.has(UNTAGGED_FILTER) && skill.tags.length === 0;
        if (!untagged && !skill.tags.some((tag) => tagFilters.has(tag)))
          return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        priority[a.sync_status] - priority[b.sync_status] ||
        a.name.localeCompare(b.name),
    );
}
