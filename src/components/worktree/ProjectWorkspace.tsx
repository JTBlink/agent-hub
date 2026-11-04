import { useWorktreePreviews } from "../../hooks/worktreePreviewsContext";
import { TabCloseButton } from "../TabCloseButton";
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FileTypeIcon } from "../FileTypeIcon";
import { WorktreeFileCloseButton } from "./WorktreeFileCloseButton";
import { useOpenProject } from "../../hooks/useOpenProject";
import { useApp } from "../../context/AppContext";
import { useProjectWorktrees } from "../../hooks/useProjectWorktrees";
import { projectWorkspaceRoute } from "../../lib/worktreeApi";
import { herdrNavigation } from "../../features/herdr/lib/herdrControlApi";
import { cn } from "../../utils";
import { TerminalWorkspace } from "../terminal/TerminalWorkspace";
import { useWorkspaceFiles } from "../../hooks/useWorkspaceFiles";
import { SidebarVisibilityContext } from "../../hooks/sidebarVisibility";
import { useActiveWorkspace } from "../../hooks/useActiveWorkspace";
import { ProjectSkillsPanel, ProjectSkillsToolbar } from "./ProjectSkillsPanel";
import { WorktreeFilePreview } from "./WorktreeFilePreview";
import { WorkspaceUnavailable } from "./WorkspaceUnavailable";
import { MissingProjectDialog } from "./MissingProjectDialog";
import { useRecentProject } from "../../hooks/useRecentProject";
import {
  GitEditorTabsContext,
  GitEditorVisibilityContext,
} from "../../hooks/gitEditorVisibility";

import type { TerminalStartupState } from "../terminal/useTerminalLayout";

const WorktreeDocumentPreview = lazy(() =>
  import("./WorktreeDocumentPreview").then((module) => ({
    default: module.WorktreeDocumentPreview,
  })),
);

/** Remains mounted with Layout so switching worktrees/pages preserves PTYs. */
export function ProjectWorkspace({
  page,
  onStartupStateChange,
}: {
  page?: ReactNode;
  onStartupStateChange?: (state: TerminalStartupState) => void;
}) {
  const { openProject, isOpening } = useOpenProject();
  const { t } = useTranslation();
  const previews = useWorktreePreviews();
  const removal = useRecentProject();
  const sidebarVisibility = useContext(SidebarVisibilityContext);
  const [gitTabsContainer, setGitTabsContainer] =
    useState<HTMLDivElement | null>(null);
  const [fileToolbar, setFileToolbar] = useState<HTMLDivElement | null>(null);
  const { projects, tools, loading: projectsLoading, appError } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
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
  const routeProjectId = route?.projectId;
  useEffect(() => {
    if (routeProjectId && !project && !projectsLoading && !appError)
      navigate("/", { replace: true });
  }, [routeProjectId, project, projectsLoading, appError, navigate]);
  const {
    worktrees,
    error,
    loading: worktreesLoading,
    refresh,
  } = useProjectWorktrees(project?.id);
  const requestedPath = route?.worktreePath ?? project?.path;
  const worktree =
    worktrees.find((item) => item.path === requestedPath) ??
    (!route?.worktreePath ? worktrees.find((item) => item.is_main) : undefined);
  const path = worktree?.path ?? requestedPath;
  const unavailable =
    !!route &&
    !!project &&
    (!!error || (worktrees.length > 0 && !worktree?.available));
  const reportStartup = useCallback(
    (state: TerminalStartupState) => {
      // A missing directory is a usable recovery page, not an app startup failure.
      onStartupStateChange?.(
        unavailable ? { ...state, ready: true, error: "" } : state,
      );
    },
    [onStartupStateChange, unavailable],
  );
  const scope = JSON.stringify([project?.id, path]);
  const previewTabs = previews?.tabs.filter((tab) => tab.scope === scope) ?? [];
  const previewShown = previewTabs.some(
    (tab) => tab.document.id === previews?.selected,
  );

  const [skillsSelection, setSkillsSelection] = useState<string | null>(null);
  const skillsKey = JSON.stringify([scope, location.key]);
  const skillsShown = skillsSelection === skillsKey && !previewShown;
  const pageShown =
    !skillsShown &&
    !previewShown &&
    gitPage &&
    gitEditorVisible &&
    pageSelection === location.key;
  const { files, setFiles, setCheckout } = useWorkspaceFiles();
  useEffect(() => {
    if (routeProjectId && path)
      setCheckout({ projectId: routeProjectId, worktreePath: path });
  }, [routeProjectId, path, setCheckout]);
  const file = files[scope];
  const selectWorkspacePreview = previews?.select;
  useEffect(() => {
    selectWorkspacePreview?.(null);
  }, [file, selectWorkspacePreview]);
  const selectPreview = (id: string) => {
    setSkillsSelection(null);
    setPageSelection("");
    previews?.select(id);
  };
  const visible = gitPage || !!route || location.pathname === "/terminal";
  const selectTerminal = () => {
    setSkillsSelection(null);
    setPageSelection("");
    previews?.select(null);
    if (file?.shown)
      setFiles((previous) => ({
        ...previous,
        [scope]: { ...file, shown: false },
      }));
  };
  return (
    <section
      hidden={!visible}
      className={cn(
        visible ? "flex" : "hidden",
        "workbench-editor-panel min-h-0 min-w-0 flex-1 flex-col overflow-hidden mr-1",
      )}
    >
      {unavailable && (
        <WorkspaceUnavailable
          path={path ?? project.path}
          loading={worktreesLoading}
          missing={!error}
          onRetry={() => void refresh()}
          onOpenOther={() => void openProject()}
          opening={isOpening}
          onRemove={
            project &&
            !error &&
            worktrees.length > 0 &&
            worktrees.every((tree) => !tree.available)
              ? () => void removal.openRecent(project)
              : undefined
          }
          checkingRemoval={removal.checking}
        />
      )}
      <MissingProjectDialog
        project={removal.missingProject}
        error={removal.removalError}
        onClose={removal.dismissMissingProject}
        onConfirm={removal.removeMissingProject}
      />
      <div
        hidden={unavailable}
        className={unavailable ? "hidden" : "flex min-h-0 min-w-0 flex-1"}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TerminalWorkspace
            onStartupStateChange={reportStartup}
            projects={projects}
            tools={tools}
            onProjectSkills={
              route
                ? () => {
                    previews?.select(null);
                    setSkillsSelection(skillsKey);
                  }
                : undefined
            }
            projectsReady={
              !projectsLoading &&
              !appError &&
              !unavailable &&
              (!route || worktrees.length > 0)
            }
            shown={
              !unavailable &&
              (!!herdrNavigation(location.state) ||
                (!skillsShown &&
                  !pageShown &&
                  !previewShown &&
                  (!file?.shown || !route)))
            }
            onSelectTerminal={selectTerminal}
            extraTabs={
              <>
                <div ref={setGitTabsContainer} className="contents" />
                {route && file && path && (
                  <div
                    className={cn(
                      "flex h-full min-w-0 items-center border-b-2",
                      file.shown && !pageShown && !skillsShown && !previewShown
                        ? "border-accent text-primary"
                        : "border-transparent text-muted",
                    )}
                  >
                    <button
                      type="button"
                      title={file.path}
                      role="tab"
                      aria-selected={
                        file.shown &&
                        !pageShown &&
                        !skillsShown &&
                        !previewShown
                      }
                      onClick={() => {
                        setSkillsSelection(null);
                        setPageSelection("");
                        previews?.select(null);
                        setFiles((previous) => ({
                          ...previous,
                          [scope]: { ...file, shown: true },
                        }));
                      }}
                      className="flex h-full min-w-0 items-center gap-1.5 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                    >
                      <FileTypeIcon path={file.path} size={13} />
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
                {previewTabs.map((tab) => (
                  <div
                    key={tab.document.id}
                    className={cn(
                      "flex h-full shrink-0 items-center border-b-2",
                      previewShown &&
                        previews?.selected === tab.document.id &&
                        !pageShown &&
                        !skillsShown
                        ? "border-accent text-primary"
                        : "border-transparent text-muted",
                    )}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={
                        previews?.selected === tab.document.id &&
                        !pageShown &&
                        !skillsShown
                      }
                      onClick={() => selectPreview(tab.document.id)}
                      title={tab.path}
                      className="flex h-full max-w-64 items-center gap-1.5 px-3 text-xs focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                    >
                      <Eye size={13} className="shrink-0" />
                      <span className="truncate">
                        {tab.document.title} · {t("fileReader.preview")}
                      </span>
                    </button>
                    <TabCloseButton
                      aria-label={t("preview.closeTab", {
                        title: tab.document.title,
                      })}
                      onClick={() => previews?.close(tab.document.id)}
                    />
                  </div>
                ))}
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
              (file?.shown || previewShown) &&
              route &&
              !pageShown &&
              !skillsShown ? (
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
                        <GitEditorTabsContext.Provider
                          value={{
                            container: gitTabsContainer,
                            active: pageShown,
                            onTerminal: selectTerminal,
                            onSelect: () => {
                              previews?.select(null);
                              setSkillsSelection(null);
                              setPageSelection(location.key);
                            },
                          }}
                        >
                          {page}
                        </GitEditorTabsContext.Provider>
                      </GitEditorVisibilityContext.Provider>
                    </SidebarVisibilityContext.Provider>
                  </div>
                )}
                <Suspense fallback={<div role="status" />}>
                  {previews?.tabs.map((tab) => (
                    <WorktreeDocumentPreview
                      key={tab.document.id}
                      document={tab.document}
                      toolbarContainer={fileToolbar}
                      onSource={() => {
                        setSkillsSelection(null);
                        setPageSelection("");
                        previews?.select(null);
                        setFiles((previous) => ({
                          ...previous,
                          [tab.scope]: { path: tab.path, shown: true },
                        }));
                      }}
                      active={
                        visible &&
                        !unavailable &&
                        tab.scope === scope &&
                        previewShown &&
                        previews?.selected === tab.document.id &&
                        !skillsShown &&
                        !pageShown
                      }
                    />
                  ))}
                </Suspense>
                {skillsShown && project && (
                  <ProjectSkillsPanel projectId={project.id} />
                )}
                {!skillsShown &&
                  !pageShown &&
                  !previewShown &&
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
