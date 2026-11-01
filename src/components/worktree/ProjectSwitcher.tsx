import { RefreshCw, Trash2, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import type { Project } from "../../lib/tauri";
import { useWorkspaceSelection } from "../../hooks/useWorkspaceSelection";
import { cn } from "../../utils";
import { CardActionMenu } from "../CardActionMenu";
import { WorktreeBranchSwitcher } from "./WorktreeBranchSwitcher";

/** The title bar selects a worktree; this row changes its branch in place. */
export function ProjectSwitcher({
  onRemove,
}: {
  onRemove: (project: Project) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projects } = useApp();
  const selection = useWorkspaceSelection(projects);
  const { project, loading, error, refresh } = selection;
  return (
    <div
      role="group"
      aria-label={t("worktree.title")}
      className="shrink-0 border-b border-border-subtle px-2 py-1"
    >
      {project && (
        <div className="flex h-7 min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">
            <WorktreeBranchSwitcher
              key={`${project.id}:${selection.path}`}
              projectId={project.id}
              worktreePath={selection.path}
              branch={selection.current?.branch ?? undefined}
              label={
                selection.current?.head && !selection.current.branch
                  ? `${t("worktree.detached")} · ${selection.current.head.slice(0, 8)}`
                  : (selection.branchLabel ?? t("git.unborn"))
              }
              disabled={
                loading || !selection.path || !selection.current?.available
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
          <CardActionMenu
            label={t("worktree.projectActions")}
            triggerClassName="h-6 w-6"
            actions={[
              {
                key: "skills",
                label: t("worktree.projectSkills"),
                icon: <BookOpen size={14} />,
                onSelect: () =>
                  navigate(
                    `/project/${project.id}/skills${selection.path ? `?${new URLSearchParams({ worktree: selection.path })}` : ""}`,
                  ),
              },
              {
                key: "remove",
                label: t("worktree.removeProject", { name: project.name }),
                icon: <Trash2 size={14} />,
                danger: true,
                onSelect: () => onRemove(project),
              },
            ]}
          />
        </div>
      )}
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
