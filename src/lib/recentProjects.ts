import type { Project } from "./tauri";

export const RECENT_PROJECT_LIMIT = 15;

/** Zero is an evicted history entry; NULL supports registrations from older versions. */
export function recentProjects(
  projects: readonly Project[],
  currentId?: string,
) {
  const recent = projects
    .filter(
      (item) => item.workspace_type === "project" && item.visited_at !== 0,
    )
    .sort(
      (a, b) =>
        (b.visited_at ?? b.updated_at) - (a.visited_at ?? a.updated_at) ||
        b.created_at - a.created_at ||
        a.id.localeCompare(b.id),
    )
    .slice(0, RECENT_PROJECT_LIMIT);
  // Another window can evict this window's current project; keep its selection usable.
  const current = projects.find((item) => item.id === currentId);
  if (current && !recent.some((item) => item.id === current.id)) {
    if (recent.length === RECENT_PROJECT_LIMIT) recent.pop();
    recent.push(current);
  }
  return recent;
}
