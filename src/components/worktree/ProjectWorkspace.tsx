import { Link, useLocation } from "react-router-dom";
import {
  BookOpen,
  FileCode2,
  GitBranch,
  RefreshCw,
  TerminalSquare,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { useProjectWorktrees } from "../../hooks/useProjectWorktrees";
import { projectWorkspaceRoute, worktreeLabel } from "../../lib/worktreeApi";
import { compactHomePath, cn } from "../../utils";
import { TerminalWorkspace } from "../terminal/TerminalWorkspace";
import { useWorkspaceFiles } from "../../hooks/useWorkspaceFiles";
import { WorktreeFilePreview } from "./WorktreeFilePreview";

/** Remains mounted with Layout so switching worktrees/pages preserves PTYs. */
export function ProjectWorkspace({
  onMaximizedChange,
}: {
  onMaximizedChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const { projects, loading: projectsLoading, appError } = useApp();
  const location = useLocation();
  const route = projectWorkspaceRoute(location.pathname, location.search);
  const project = projects.find((item) => item.id === route?.projectId);
  const { worktrees, loading, error, refresh } = useProjectWorktrees(
    project?.id,
  );
  const requestedPath = route?.worktreePath ?? project?.path;
  const worktree =
    worktrees.find((item) => item.path === requestedPath) ??
    (!route?.worktreePath ? worktrees.find((item) => item.is_main) : undefined);
  const path = worktree?.path ?? requestedPath;
  const scope = JSON.stringify([project?.id, path]);
  const { files, setFiles } = useWorkspaceFiles();
  const file = files[scope];
  const visible = !!route || location.pathname === "/terminal";
  return (
    <section
      hidden={!visible}
      className={cn(
        visible ? "flex" : "hidden",
        "workbench-editor-panel min-h-0 min-w-0 flex-1 flex-col overflow-hidden mr-1",
      )}
    >
      {route && (
        <header className="flex h-8 shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-secondary px-3">
          <span className="max-w-[30%] truncate text-xs text-muted">
            {project?.name}
          </span>
          <ChevronSeparator />
          <GitBranch size={13} className="shrink-0 text-accent" />
          <span
            title={path && compactHomePath(path)}
            className="min-w-0 flex-1 truncate text-xs font-medium"
          >
            {worktree ? worktreeLabel(worktree) : t("worktree.title")}
          </span>
          {worktree?.is_main && (
            <span className="rounded border border-border px-1 text-xs text-muted">
              {t("worktree.main")}
            </span>
          )}
          <button
            type="button"
            disabled={loading}
            aria-label={t("worktree.refresh")}
            title={t("worktree.refresh")}
            onClick={() => void refresh()}
            className="app-button-ghost h-7 w-7 shrink-0 p-0"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
          </button>
          <Link
            to={`/project/${route.projectId}/skills${location.search}`}
            className="app-button-ghost shrink-0 gap-1.5 text-xs"
          >
            <BookOpen size={13} />
            {t("worktree.projectSkills")}
          </Link>
        </header>
      )}
      {route &&
        (error ||
          (worktrees.length > 0 && (!worktree || !worktree.available))) && (
          <div
            role="alert"
            className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2 text-xs text-danger"
          >
            <span className="min-w-0 flex-1">
              {error || t("worktree.unavailable")}
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="app-button-ghost"
            >
              {t("common.retry")}
            </button>
          </div>
        )}
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {file && route && (
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle bg-bg-secondary px-2">
              <button
                type="button"
                aria-pressed={!file.shown}
                onClick={() =>
                  setFiles((previous) => ({
                    ...previous,
                    [scope]: { ...file, shown: false },
                  }))
                }
                className={cn(
                  "app-button-ghost gap-1.5 text-xs",
                  !file.shown && "bg-surface-active",
                )}
              >
                <TerminalSquare size={13} />
                {t("terminal.title")}
              </button>
              <button
                type="button"
                title={file.path}
                aria-pressed={file.shown}
                onClick={() =>
                  setFiles((previous) => ({
                    ...previous,
                    [scope]: { ...file, shown: true },
                  }))
                }
                className={cn(
                  "app-button-ghost min-w-0 gap-1.5 text-xs",
                  file.shown && "bg-surface-active",
                )}
              >
                <FileCode2 size={13} className="shrink-0" />
                <span className="truncate">{file.path.split("/").at(-1)}</span>
              </button>
              <button
                type="button"
                aria-label={t("fileReader.closeFile", { path: file.path })}
                onClick={() =>
                  setFiles((previous) => {
                    const next = { ...previous };
                    delete next[scope];
                    return next;
                  })
                }
                className="app-button-ghost h-6 w-6 shrink-0 p-0"
              >
                <X size={12} />
              </button>
            </div>
          )}
          <TerminalWorkspace
            projects={projects}
            projectsReady={!projectsLoading && !appError}
            shown={!file?.shown || !route}
            onMaximizedChange={onMaximizedChange}
          />
          {route && project && path && file?.shown && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <WorktreeFilePreview
                key={`${scope}:${file.path}`}
                projectId={project.id}
                worktreePath={path}
                path={file.path}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ChevronSeparator() {
  return (
    <span className="text-xs text-muted" aria-hidden="true">
      /
    </span>
  );
}
