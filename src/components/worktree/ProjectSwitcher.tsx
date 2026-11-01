import { WorktreeBranchSwitcher } from "./WorktreeBranchSwitcher";
import { RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import type { Project } from "../../lib/tauri";
import { useWorkspaceSelection } from "../../hooks/useWorkspaceSelection";
import { cn } from "../../utils";

export function ProjectSwitcher({
  onRemove,
}: {
  onRemove: (project: Project) => void;
}) {
  const { t } = useTranslation();
  const { projects } = useApp();
  const selection = useWorkspaceSelection(projects);
  const { project, loading, error, refresh } = selection;
  return (
    <div
      role="group"
      aria-label={t("worktree.title")}
      className="shrink-0 border-b border-border-subtle px-2 py-1"
    >
      <div className="flex h-7 min-w-0 items-center gap-0.5">
        {project && (
          <>
            <div className="min-w-0 flex-1">
              <WorktreeBranchSwitcher
                key={`${project.id}:${selection.path}`}
                projectId={project.id}
                worktreePath={selection.path}
                branch={selection.current?.branch ?? undefined}
                label={selection.branchLabel ?? t("git.unborn")}
                disabled={
                  loading ||
                  !selection.path ||
                  selection.current?.available === false
                }
              />
            </div>
            <button
              type="button"
              disabled={loading}
              aria-label={t("worktree.refresh")}
              title={t("worktree.refresh")}
              onClick={() => void refresh()}
              className="app-button-ghost h-6 w-6 shrink-0 p-0 text-muted hover:text-secondary"
            >
              <RefreshCw size={13} className={cn(loading && "animate-spin")} />
            </button>
          </>
        )}
        {project && (
          <button
            type="button"
            title={t("worktree.removeProject", { name: project.name })}
            aria-label={t("worktree.removeProject", { name: project.name })}
            onClick={() => onRemove(project)}
            className="app-button-ghost h-6 w-6 shrink-0 p-0 text-muted hover:text-danger"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="break-words text-xs text-danger">
          {error}
        </p>
      )}
      {!projects.length && (
        <p className="text-xs text-muted">{t("sidebar.openProjectHint")}</p>
      )}
    </div>
  );
}
