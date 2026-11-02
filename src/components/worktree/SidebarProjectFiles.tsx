import { useLocation } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { useProjectWorktrees } from "../../hooks/useProjectWorktrees";
import { projectCheckoutRoute } from "../../lib/worktreeApi";
import { WorktreeExplorer } from "./WorktreeExplorer";
import { useWorkspaceFiles } from "../../hooks/useWorkspaceFiles";
import type { GitFile } from "../../lib/gitApi";

export function SidebarProjectFiles({
  changes,
}: {
  changes?: { key: string; files: GitFile[] };
}) {
  const { pathname, search } = useLocation();
  const route = projectCheckoutRoute(pathname, search);
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
      gitFiles={changes?.key === scope ? changes.files : undefined}
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
