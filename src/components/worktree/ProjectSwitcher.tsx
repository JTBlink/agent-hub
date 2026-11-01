import { useLocation, useMatch, useNavigate } from "react-router-dom";
import { FolderOpen, GitBranch, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemedSelect } from "../ThemedSelect";
import { useApp } from "../../context/AppContext";
import { useProjectWorktrees } from "../../hooks/useProjectWorktrees";
import { worktreeLabel, worktreeUrl } from "../../lib/worktreeApi";
import { touchProjectVisited, type Project } from "../../lib/tauri";
import { lastWorkspace } from "../../lib/lastWorkspace";
import { compactHomePath, cn } from "../../utils";

export function ProjectSwitcher({
  onRemove,
}: {
  onRemove: (project: Project) => void;
}) {
  const { t } = useTranslation();
  const { projects } = useApp();
  const route = useMatch("/project/:id/*");
  const { search } = useLocation();
  const navigate = useNavigate();
  const previous = lastWorkspace(projects);
  const routeProject = projects.find((item) => item.id === route?.params.id);
  const project = routeProject ?? previous?.project;
  const { worktrees, loading, error, refresh } = useProjectWorktrees(
    project?.id,
  );
  const requested = routeProject
    ? (new URLSearchParams(search).get("worktree") ?? project?.path)
    : previous?.path;
  const current =
    worktrees.find((item) => item.path === requested) ??
    (!new URLSearchParams(search).has("worktree")
      ? worktrees.find((item) => item.is_main)
      : undefined);
  const open = (target: Project, path = target.path) => {
    void touchProjectVisited(target.id).catch(() => {});
    navigate(worktreeUrl(target.id, path));
  };
  return (
    <div className="space-y-1 border-b border-border-subtle p-2">
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">
          <ThemedSelect
            aria-label={t("sidebar.switchProject")}
            title={
              project
                ? compactHomePath(project.path)
                : t("sidebar.switchProject")
            }
            value={project?.id ?? ""}
            onChange={(event) => {
              const next = projects.find(
                (item) => item.id === event.target.value,
              );
              if (next) open(next);
            }}
            leadingIcon={<FolderOpen size={14} className="shrink-0" />}
            className="w-full rounded border border-border-subtle bg-surface px-2 py-1 text-sm"
          >
            {!project && (
              <option value="" disabled>
                {t("sidebar.switchProject")}
              </option>
            )}
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </ThemedSelect>
        </div>
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
      {project && (
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">
            <ThemedSelect
              aria-label={t("worktree.title")}
              value={current?.path ?? ""}
              disabled={loading || worktrees.length === 0}
              onChange={(event) => open(project, event.target.value)}
              leadingIcon={<GitBranch size={13} className="shrink-0" />}
              className="h-7 w-full gap-2 rounded border-transparent bg-transparent px-2 py-0 text-xs text-muted hover:text-secondary"
            >
              <option value="" disabled>
                {t(loading ? "common.loading" : "worktree.title")}
              </option>
              {worktrees.map((item) => (
                <option
                  key={item.path}
                  value={item.path}
                  disabled={!item.available}
                >
                  {worktreeLabel(item)}
                  {!item.available ? ` · ${t("worktree.unavailable")}` : ""}
                </option>
              ))}
            </ThemedSelect>
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
