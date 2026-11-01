import type { Project } from "./tauri";
import { readTerminalLayout } from "./terminalLayout";

/** Share the terminal's saved checkout instead of maintaining another last-project setting. */
export function lastWorkspace(projects: readonly Project[]) {
  const layout = readTerminalLayout();
  const tab = layout.tabs.find((item) => item.id === layout.lastActiveId);
  const remembered = projects.find((item) => item.id === tab?.projectId);
  if (remembered)
    return { project: remembered, path: tab?.worktreePath ?? remembered.path };
  const project = projects.reduce<Project | undefined>(
    (latest, item) =>
      !latest || (item.visited_at ?? 0) > (latest.visited_at ?? 0)
        ? item
        : latest,
    undefined,
  );
  return project ? { project, path: project.path } : null;
}
