import { RefreshCw, Trash2, BookOpen } from "lucide-react";
import { useContext } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import type { Project } from "../../lib/tauri";
import { useWorkspaceSelection } from "../../hooks/useWorkspaceSelection";
import { cn } from "../../utils";
import { CardActionMenu } from "../CardActionMenu";
import { WorktreeBranchSwitcher } from "./WorktreeBranchSwitcher";
import { SidebarVisibilityContext } from "../../hooks/sidebarVisibility";

/** The title bar selects a project; the explorer selects its checkout; the footer changes its branch in place. */
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
  const branchContainer = useContext(SidebarVisibilityContext)?.branchContainer;
  const compact = !!branchContainer;
  if (compact && !project) return null;
  const content = (
    <div
      role="group"
      aria-label={t("worktree.title")}
      className={
        compact
          ? "relative flex h-full max-w-[280px] min-w-0 items-center"
          : "shrink-0 border-b border-border-subtle px-2 py-1"
      }
    >
      {project && (
        <div
          className={cn(
            "flex min-w-0 items-center gap-1",
            compact ? "h-full" : "h-7",
          )}
        >
          <div className="min-w-0 flex-1">
            <WorktreeBranchSwitcher
              key={`${project.id}:${selection.path}`}
              projectId={project.id}
              worktreePath={selection.path}
              branch={selection.current?.branch ?? undefined}
              label={
                selection.current?.head && !selection.current.branch
                  ? `${t("worktree.detached")} · ${selection.current.head.slice(0, 8)}`
                  : selection.current && !selection.current.available
                    ? t("worktree.missingDirectory.title")
                    : (selection.branchLabel ?? t("git.unborn"))
              }
              disabled={
                loading || !selection.path || !selection.current?.available
              }
              compact={compact}
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
        <p
          role="alert"
          className={cn(
            "break-words text-xs text-danger",
            compact &&
              "absolute bottom-full left-0 z-50 w-72 rounded border border-border bg-surface p-2 shadow-card",
          )}
        >
          {t("worktree.missingDirectory.accessDescription")}
        </p>
      )}
      {!projects.length && (
        <p className="text-xs text-muted">{t("sidebar.openProjectHint")}</p>
      )}
    </div>
  );
  return branchContainer ? createPortal(content, branchContainer) : content;
}
