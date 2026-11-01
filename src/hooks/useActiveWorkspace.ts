import { useContext } from "react";
import type { Project } from "../lib/tauri";
import { lastWorkspace } from "../lib/lastWorkspace";
import { WorkspaceFilesContext } from "./useWorkspaceFiles";

/** Git, search and navigation follow the checkout selected by the project workspace. */
export function useActiveWorkspace(projects: readonly Project[]) {
  const checkout = useContext(WorkspaceFilesContext)?.checkout;
  const selected = projects.find(
    (project) => project.id === checkout?.projectId,
  );
  const previous = lastWorkspace(projects);
  const project = selected ?? previous?.project;
  const path = selected ? checkout?.worktreePath : previous?.path;
  return { project, path };
}
