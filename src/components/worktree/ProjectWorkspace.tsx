import { useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { FileCode2 } from "lucide-react";
import { WorktreeFileCloseButton } from "./WorktreeFileCloseButton";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { useProjectWorktrees } from "../../hooks/useProjectWorktrees";
import { projectWorkspaceRoute } from "../../lib/worktreeApi";
import { cn } from "../../utils";
import { TerminalWorkspace } from "../terminal/TerminalWorkspace";
import { useWorkspaceFiles } from "../../hooks/useWorkspaceFiles";
import { SidebarVisibilityContext } from "../../hooks/sidebarVisibility";
import { useActiveWorkspace } from "../../hooks/useActiveWorkspace";
import { ProjectSkillsPanel, ProjectSkillsToolbar } from "./ProjectSkillsPanel";
import { WorktreeFilePreview } from "./WorktreeFilePreview";
import { GitEditorVisibilityContext } from "../../hooks/gitEditorVisibility";

/** Remains mounted with Layout so switching worktrees/pages preserves PTYs. */
export function ProjectWorkspace({ page }: { page?: ReactNode }) {
  const { t } = useTranslation();
  const sidebarVisibility = useContext(SidebarVisibilityContext);
  const [fileToolbar, setFileToolbar] = useState<HTMLDivElement | null>(null);
  const { projects, loading: projectsLoading, appError } = useApp();
  const location = useLocation();
  const activeWorkspace = useActiveWorkspace(projects);
  const gitPage = location.pathname === "/git";
  const route =
    projectWorkspaceRoute(location.pathname, location.search) ??
    (gitPage && activeWorkspace.project
      ? {
          projectId: activeWorkspace.project.id,
          worktreePath: activeWorkspace.path,
        }
      : null);
  const [pageSelection, setPageSelection] = useState(location.key);
  const [previousLocation, setPreviousLocation] = useState(location.key);
  if (previousLocation !== location.key) {
    setPreviousLocation(location.key);
    setPageSelection(location.key);
  }
  const [gitEditorVisible, setGitEditorVisible] = useState(false);
  const project = projects.find((item) => item.id === route?.projectId);
  const { worktrees, error, refresh } = useProjectWorktrees(project?.id);
  const requestedPath = route?.worktreePath ?? project?.path;
  const worktree =
    worktrees.find((item) => item.path === requestedPath) ??
    (!route?.worktreePath ? worktrees.find((item) => item.is_main) : undefined);
  const path = worktree?.path ?? requestedPath;
  const scope = JSON.stringify([project?.id, path]);
  const [skillsSelection, setSkillsSelection] = useState<string | null>(null);
  const skillsKey = JSON.stringify([scope, location.key]);
  const skillsShown = skillsSelection === skillsKey;
  const pageShown =
    !skillsShown &&
    gitPage &&
    gitEditorVisible &&
    pageSelection === location.key;
  const { files, setFiles, setCheckout } = useWorkspaceFiles();
  const routeProjectId = route?.projectId;
  useEffect(() => {
    if (routeProjectId && path)
      setCheckout({ projectId: routeProjectId, worktreePath: path });
  }, [routeProjectId, path, setCheckout]);
  const file = files[scope];
  const visible = gitPage || !!route || location.pathname === "/terminal";
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
            onProjectSkills={
              route ? () => setSkillsSelection(skillsKey) : undefined
            }
            projectsReady={!projectsLoading && !appError}
            shown={!skillsShown && !pageShown && (!file?.shown || !route)}
            onSelectTerminal={() => {
              setSkillsSelection(null);
              setPageSelection("");
              if (file?.shown)
                setFiles((previous) => ({
                  ...previous,
                  [scope]: { ...file, shown: false },
                }));
            }}
            extraTabs={
              <>
                {route && file && path && (
                  <div
                    className={cn(
                      "flex h-full min-w-0 items-center border-b-2",
                      file.shown && !pageShown && !skillsShown
                        ? "border-accent text-primary"
                        : "border-transparent text-muted",
                    )}
                  >
                    <button
                      type="button"
                      title={file.path}
                      role="tab"
                      aria-selected={file.shown && !pageShown && !skillsShown}
                      onClick={() => {
                        setSkillsSelection(null);
                        setPageSelection("");
                        setFiles((previous) => ({
                          ...previous,
                          [scope]: { ...file, shown: true },
                        }));
                      }}
                      className="flex h-full min-w-0 items-center gap-1.5 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
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
                )}
              </>
            }
            toolbar={
              skillsShown ? (
                <ProjectSkillsToolbar
                  onClose={() => setSkillsSelection(null)}
                />
              ) : undefined
            }
            toolbarEnd={
              file?.shown && route && !pageShown && !skillsShown ? (
                <div
                  ref={setFileToolbar}
                  className="flex shrink-0 items-center"
                />
              ) : undefined
            }
            content={
              <>
                {gitPage && (
                  <div
                    hidden={!pageShown}
                    className={
                      pageShown ? "flex min-h-0 flex-1 flex-col" : "hidden"
                    }
                    onClickCapture={() => setPageSelection(location.key)}
                    onFocusCapture={() => setPageSelection(location.key)}
                  >
                    <SidebarVisibilityContext.Provider
                      value={
                        sidebarVisibility
                          ? {
                              ...sidebarVisibility,
                              statusContainer: pageShown
                                ? sidebarVisibility.statusContainer
                                : null,
                            }
                          : null
                      }
                    >
                      <GitEditorVisibilityContext.Provider
                        value={setGitEditorVisible}
                      >
                        {page}
                      </GitEditorVisibilityContext.Provider>
                    </SidebarVisibilityContext.Provider>
                  </div>
                )}
                {skillsShown && project && (
                  <ProjectSkillsPanel projectId={project.id} />
                )}
                {!skillsShown &&
                  !pageShown &&
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
                  )}
              </>
            }
          />
        </div>
      </div>
    </section>
  );
}
