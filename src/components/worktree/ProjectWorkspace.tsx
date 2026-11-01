import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, FileCode2 } from "lucide-react";
import { WorktreeFileCloseButton } from "./WorktreeFileCloseButton";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { useProjectWorktrees } from "../../hooks/useProjectWorktrees";
import { projectWorkspaceRoute } from "../../lib/worktreeApi";
import { cn } from "../../utils";
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
  const [fileToolbar, setFileToolbar] = useState<HTMLDivElement | null>(null);
  const { projects, loading: projectsLoading, appError } = useApp();
  const location = useLocation();
  const route = projectWorkspaceRoute(location.pathname, location.search);
  const project = projects.find((item) => item.id === route?.projectId);
  const { worktrees, error, refresh } = useProjectWorktrees(project?.id);
  const requestedPath = route?.worktreePath ?? project?.path;
  const worktree =
    worktrees.find((item) => item.path === requestedPath) ??
    (!route?.worktreePath ? worktrees.find((item) => item.is_main) : undefined);
  const path = worktree?.path ?? requestedPath;
  const scope = JSON.stringify([project?.id, path]);
  const { files, setFiles, setCheckout } = useWorkspaceFiles();
  const routeProjectId = route?.projectId;
  useEffect(() => {
    if (routeProjectId && path)
      setCheckout({ projectId: routeProjectId, worktreePath: path });
  }, [routeProjectId, path, setCheckout]);
  const file = files[scope];
  const visible = !!route || location.pathname === "/terminal";
  const workspaceActions = route && (
    <Link
      to={`/project/${route.projectId}/skills${location.search}`}
      aria-label={t("worktree.projectSkills")}
      title={t("worktree.projectSkills")}
      className="app-button-ghost h-7 w-7 shrink-0 p-0 text-muted"
    >
      <BookOpen size={13} />
    </Link>
  );
  return (
    <section
      hidden={!visible}
      className={cn(
        visible ? "flex" : "hidden",
        "workbench-editor-panel min-h-0 min-w-0 flex-1 flex-col overflow-hidden mr-1",
      )}
    >
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
          <TerminalWorkspace
            projects={projects}
            projectsReady={!projectsLoading && !appError}
            shown={!file?.shown || !route}
            onMaximizedChange={onMaximizedChange}
            onSelectTerminal={() => {
              if (file?.shown)
                setFiles((previous) => ({
                  ...previous,
                  [scope]: { ...file, shown: false },
                }));
            }}
            extraTabs={
              route &&
              file &&
              path && (
                <div
                  className={cn(
                    "flex h-full min-w-0 items-center rounded-t border-b-2",
                    file.shown
                      ? "border-accent bg-surface"
                      : "border-transparent",
                  )}
                >
                  <button
                    type="button"
                    title={file.path}
                    role="tab"
                    aria-selected={file.shown}
                    onClick={() =>
                      setFiles((previous) => ({
                        ...previous,
                        [scope]: { ...file, shown: true },
                      }))
                    }
                    className="flex h-full min-w-0 items-center gap-1.5 px-2 text-xs text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                  >
                    <FileCode2 size={13} className="shrink-0" />
                    <span className="truncate">
                      {file.path.split("/").at(-1)}
                    </span>
                  </button>
                  <WorktreeFileCloseButton
                    key={`${scope}:${file.path}`}
                    projectId={route.projectId}
                    worktreePath={path}
                    path={file.path}
                    onClose={() =>
                      setFiles((previous) => {
                        const next = { ...previous };
                        delete next[scope];
                        return next;
                      })
                    }
                  />
                </div>
              )
            }
            toolbarEnd={
              file?.shown && route ? (
                <div
                  ref={setFileToolbar}
                  className="flex shrink-0 items-center"
                />
              ) : (
                workspaceActions
              )
            }
            content={
              route &&
              project &&
              path &&
              file?.shown && (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <WorktreeFilePreview
                    key={`${scope}:${file.path}`}
                    projectId={project.id}
                    worktreePath={path}
                    path={file.path}
                    location={file.location}
                    toolbarContainer={fileToolbar}
                  />
                </div>
              )
            }
          />
        </div>
      </div>
    </section>
  );
}
