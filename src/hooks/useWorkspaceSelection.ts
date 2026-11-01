import { useContext } from "react";
import { useLocation, useMatch, useNavigate } from "react-router-dom";
import type { Project } from "../lib/tauri";
import { touchProjectVisited } from "../lib/tauri";
import { worktreeUrl } from "../lib/worktreeApi";
import { useActiveWorkspace } from "./useActiveWorkspace";
import { useProjectWorktrees } from "./useProjectWorktrees";
import { WorkspaceFilesContext } from "./useWorkspaceFiles";

/** Title bar and sidebar consume the same checkout options and selection rules. */
export function useWorkspaceSelection(projects: readonly Project[]) {
  const route = useMatch("/project/:id/*");
  const { search } = useLocation();
  const navigate = useNavigate();
  const workspace = useContext(WorkspaceFilesContext);
  const active = useActiveWorkspace(projects);
  const routeProject = projects.find(
    (project) => project.id === route?.params.id,
  );
  const project = routeProject ?? active.project;
  const explicitPath = routeProject
    ? new URLSearchParams(search).get("worktree")
    : null;
  const requested = routeProject
    ? (explicitPath ?? routeProject.path)
    : (active.path ?? project?.path);
  const snapshot = useProjectWorktrees(project?.id);
  const current =
    snapshot.worktrees.find((item) => item.path === requested) ??
    (!explicitPath && requested === project?.path
      ? snapshot.worktrees.find((item) => item.is_main)
      : undefined);
  const path = current?.path ?? requested;
  const value = project && path ? JSON.stringify([project.id, path]) : "";
  const options = projects.flatMap((item) => {
    const worktrees = item.id === project?.id ? snapshot.worktrees : [];
    if (!worktrees.length)
      return [
        {
          value: JSON.stringify([item.id, item.path]),
          label: item.name,
          disabled: false,
          projectId: item.id,
          worktreePath: item.path,
        },
      ];
    return worktrees.map((worktree) => ({
      value: JSON.stringify([item.id, worktree.path]),
      label: `${item.name} · ${worktree.branch ?? worktree.head?.slice(0, 8) ?? worktree.path.split(/[\\/]/).filter(Boolean).at(-1)}`,
      disabled: !worktree.available,
      projectId: item.id,
      worktreePath: worktree.path,
    }));
  });
  // Preserve an unavailable or still-loading route instead of displaying the main checkout.
  if (
    value &&
    project &&
    path &&
    !options.some((option) => option.value === value)
  )
    options.push({
      value,
      label: `${project?.name} · ${path?.split(/[\\/]/).filter(Boolean).at(-1)}`,
      disabled: true,
      projectId: project.id,
      worktreePath: path,
    });
  const select = (nextValue: string) => {
    const option = options.find(
      (item) => item.value === nextValue && !item.disabled,
    );
    if (!option) return;
    const { projectId, worktreePath } = option;
    workspace?.setCheckout({ projectId, worktreePath });
    void touchProjectVisited(projectId).catch(() => {});
    navigate(worktreeUrl(projectId, worktreePath));
  };
  return { ...snapshot, project, current, path, value, options, select };
}
