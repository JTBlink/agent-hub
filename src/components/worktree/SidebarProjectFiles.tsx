import { WorktreeCheckoutSwitcher } from "./WorktreeCheckoutSwitcher";
import { useLocation } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { useProjectWorktrees } from "../../hooks/useProjectWorktrees";
import { projectCheckoutRoute } from "../../lib/worktreeApi";
import { WorktreeExplorer } from "./WorktreeExplorer";
import { useWorkspaceFiles } from "../../hooks/useWorkspaceFiles";
import type { GitFile } from "../../lib/gitApi";
import { WorkspaceUnavailable } from "./WorkspaceUnavailable";

export function SidebarProjectFiles({
  changes,
}: {
  changes?: { key: string; files: GitFile[] };
}) {
  const { pathname, search } = useLocation();
  const route = projectCheckoutRoute(pathname, search);
  const { projects } = useApp();
  const project = projects.find((item) => item.id === route?.projectId);
  const { worktrees, loading, error, refresh } = useProjectWorktrees(
    project?.id,
  );
  const { files, setFiles } = useWorkspaceFiles();
  const requested = route?.worktreePath ?? project?.path;
  const worktree =
    worktrees.find((item) => item.path === requested) ??
    (!route?.worktreePath ? worktrees.find((item) => item.is_main) : undefined);
  if (!route || !project) return null;
  if (error || (worktrees.length > 0 && !worktree?.available))
    return (
      <div className="min-h-0">
        <WorktreeCheckoutSwitcher />
        <WorkspaceUnavailable
          compact
          path={requested ?? project.path}
          loading={loading}
          missing={!error}
          onRetry={() => void refresh()}
        />
      </div>
    );
  if (!worktree?.available) return null;
  const scope = JSON.stringify([project.id, worktree.path]);
  return (
    <WorktreeExplorer
      checkoutSwitcher={<WorktreeCheckoutSwitcher />}
      key={scope}
      projectId={project.id}
      worktreePath={worktree.path}
      gitFiles={changes?.key === scope ? changes.files : undefined}
      selected={files[scope]?.path}
      onEntryChange={(change) => {
        if (change.kind !== "rename" && change.kind !== "delete") return;
        setFiles((previous) => {
          const file = previous[scope];
          if (
            !file ||
            (file.path !== change.path &&
              !file.path.startsWith(`${change.path}/`))
          )
            return previous;
          const next = { ...previous };
          if (change.kind === "delete") delete next[scope];
          else
            next[scope] = {
              ...file,
              path: change.nextPath + file.path.slice(change.path.length),
            };
          return next;
        });
      }}
      onSelect={(path) =>
        setFiles((previous) => ({
          ...previous,
          [scope]: { path, shown: true },
        }))
      }
    />
  );
}
