import { useLocation } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { useProjectWorktrees } from "../../hooks/useProjectWorktrees";
import { projectWorkspaceRoute } from "../../lib/worktreeApi";
import { WorktreeExplorer } from "./WorktreeExplorer";
import { useWorkspaceFiles } from "../../hooks/useWorkspaceFiles";

export function SidebarProjectFiles() {
  const { pathname, search } = useLocation();
  const route = projectWorkspaceRoute(pathname, search);
  const { projects } = useApp();
  const project = projects.find((item) => item.id === route?.projectId);
  const { worktrees } = useProjectWorktrees(project?.id);
  const { files, setFiles } = useWorkspaceFiles();
  const requested = route?.worktreePath ?? project?.path;
  const worktree =
    worktrees.find((item) => item.path === requested) ??
    (!route?.worktreePath ? worktrees.find((item) => item.is_main) : undefined);
  if (!route || !project || !worktree?.available) return null;
  const scope = JSON.stringify([project.id, worktree.path]);
  return (
    <WorktreeExplorer
      key={scope}
      projectId={project.id}
      worktreePath={worktree.path}
      selected={files[scope]?.path}
      onSelect={(path) =>
        setFiles((previous) => ({
          ...previous,
          [scope]: { path, shown: true },
        }))
      }
    />
  );
}
