import { embeddedAgentDeliveryAdapter } from "../lib/previewAgentDelivery";
import { PreviewHost } from "../features/preview/PreviewHost";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { TerminalStartupState } from "./terminal/useTerminalLayout";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AddProjectDialog } from "./AddProjectDialog";
import { useApplicationMenu } from "../hooks/useApplicationMenu";
import { SidebarVisibilityContext } from "../hooks/sidebarVisibility";
import { Sidebar } from "./Sidebar";
import { StatusBanner } from "./StatusBanner";
import { CommandPalette } from "./CommandPalette";
import { MissingProjectDialog } from "./worktree/MissingProjectDialog";
import { useApp } from "../context/AppContext";
import { useTranslation } from "react-i18next";
import { WindowTitleBar } from "./WindowTitleBar";
import { ProjectWorkspace } from "./worktree/ProjectWorkspace";
import {
  projectCheckoutRoute,
  projectWorkspaceRoute,
} from "../lib/worktreeApi";
import { cn } from "../utils";
import { WorkspaceFilesProvider } from "./worktree/WorkspaceFilesContext";
import { WorkbenchStatusBar } from "./statusbar/WorkbenchStatusBar";
import { readTerminalLayout } from "../lib/terminalLayout";
import { listenWorkspaceEvent } from "../lib/workspaceWindow";
import { worktreeUrl } from "../lib/worktreeApi";
import type { SidebarPanelRequest } from "../lib/sidebarSections";

export function Layout() {
  const { t } = useTranslation();
  const { appError, refreshAppData, refreshProjects, loading, projects } =
    useApp();
  const [started, setStarted] = useState(false);
  const [startup, setStartup] = useState<TerminalStartupState | null>(null);
  const [initialTerminals] = useState(readTerminalLayout);
  const { pathname, search } = useLocation();
  const welcomeReady =
    pathname === "/" &&
    !initialTerminals.tabs.some((tab) =>
      projects?.some((project) => project.id === tab.projectId),
    );
  // Initial hydration is one-shot; normal refreshes keep the current page mounted.
  if (!started && !loading && (startup?.ready || welcomeReady))
    setStarted(true);
  const currentTerminalLayout = readTerminalLayout();
  const currentTerminal = currentTerminalLayout.tabs.find(
    (tab) => tab.id === currentTerminalLayout.lastActiveId,
  );
  const workspacePath =
    currentTerminal?.worktreePath ??
    projects.find((project) => project.id === currentTerminal?.projectId)?.path;
  const navigate = useNavigate();
  useEffect(() => {
    const unlisten = listenWorkspaceEvent<{ projectId: string; path: string }>(
      "workspace-open-directory",
      ({ payload }) => {
        void navigate(worktreeUrl(payload.projectId, payload.path));
      },
    );
    return () => {
      void unlisten.then((fn) => fn()).catch(console.error);
    };
  }, [navigate]);
  const workspacePage =
    !!projectWorkspaceRoute(pathname, search) || pathname === "/terminal";
  const projectSkillsPage =
    !!projectCheckoutRoute(pathname, search) && !workspacePage;
  const [gitSidebarVisible, setGitSidebarVisible] = useState(true);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [manageWorkspaces, setManageWorkspaces] = useState(false);
  const applicationMenu = useApplicationMenu(
    () => setCommandsOpen(true),
    () => setManageWorkspaces(true),
  );
  const [sidebarContainer, setSidebarContainer] =
    useState<HTMLDivElement | null>(null);
  const [statusContainer, setStatusContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [branchContainer, setBranchContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [resourcePanelVisible, setResourcePanelVisible] = useState(false);
  const [panelRequest, setPanelRequest] = useState<SidebarPanelRequest | null>(
    null,
  );
  const discoveryPage = pathname === "/discover" || pathname === "/install";
  const fullHeightPage =
    projectSkillsPage ||
    discoveryPage ||
    pathname === "/preview" ||
    pathname === "/settings" ||
    pathname === "/backup/diff" ||
    pathname === "/tasks" ||
    pathname === "/git";

  // Cmd+, to open Settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        )
          return;
        e.preventDefault();
        navigate("/settings");
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        )
          return;
        e.preventDefault();
        refreshAppData();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [navigate, refreshAppData]);

  return (
    <SidebarVisibilityContext.Provider
      value={{
        resourcePanelVisible,
        setGitSidebarVisible,
        setResourcePanelVisible,
        sidebarContainer,
        statusContainer,
        branchContainer,
        panelRequest,
        openSidebarPanel: (panel, view) =>
          setPanelRequest((previous) => ({
            id: (previous?.id ?? 0) + 1,
            panel,
            view,
          })),
      }}
    >
      <WorkspaceFilesProvider
        projects={projects}
        pathname={pathname}
        search={search}
      >
        <div
          inert={!started}
          className="relative flex h-full w-full flex-col overflow-hidden bg-background text-primary"
        >
          <WindowTitleBar onOpenCommands={() => setCommandsOpen(true)} />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <Sidebar />
            <div
              ref={setSidebarContainer}
              hidden={
                (pathname !== "/git" && pathname !== "/settings") ||
                resourcePanelVisible ||
                (pathname === "/git" && !gitSidebarVisible)
              }
              className={cn(
                "min-h-0 shrink-0",
                (pathname === "/git" || pathname === "/settings") &&
                  !resourcePanelVisible &&
                  (pathname !== "/git" || gitSidebarVisible)
                  ? "flex"
                  : "hidden",
              )}
            />
            <div
              className={cn(
                "workbench-editor-panel relative min-w-0 flex-1 flex-col overflow-hidden mr-1",
                workspacePage || pathname === "/git" ? "hidden" : "flex",
              )}
            >
              <div
                className={cn(
                  "workbench-page-host min-h-0 flex-1",
                  pathname === "/git" ||
                    pathname === "/preview" ||
                    discoveryPage ||
                    projectSkillsPage
                    ? "p-0"
                    : "p-3",
                  fullHeightPage
                    ? "flex flex-col overflow-hidden"
                    : "workbench-page-scroll overflow-y-auto",
                )}
              >
                <div
                  className={cn(
                    "workbench-page-stack flex w-full min-w-0 flex-col gap-3",
                    fullHeightPage ? "min-h-0 flex-1" : "min-h-full",
                  )}
                >
                  {appError ? (
                    <StatusBanner
                      compact
                      title={t("common.dataOutOfDate")}
                      description={appError}
                      actionLabel={t("common.retry")}
                      onAction={refreshAppData}
                      tone="danger"
                    />
                  ) : null}
                  {started && pathname !== "/git" && <Outlet />}
                  {started && (
                    <PreviewHost
                      active={pathname === "/preview"}
                      deliveryAdapter={embeddedAgentDeliveryAdapter}
                      workspacePath={workspacePath}
                    />
                  )}
                </div>
              </div>
            </div>
            <ProjectWorkspace
              onStartupStateChange={setStartup}
              page={started && pathname === "/git" ? <Outlet /> : undefined}
            />
          </div>
          <WorkbenchStatusBar
            branchRef={setBranchContainer}
            statusRef={setStatusContainer}
          />
          <AddProjectDialog
            open={manageWorkspaces}
            onClose={() => setManageWorkspaces(false)}
            onAdded={async () => {
              await refreshProjects();
            }}
          />
          <CommandPalette open={commandsOpen} onOpenChange={setCommandsOpen} />
          <MissingProjectDialog
            project={applicationMenu?.missingProject ?? null}
            error={applicationMenu?.removalError ?? ""}
            onClose={() => applicationMenu?.dismissMissingProject()}
            onConfirm={async () =>
              await applicationMenu?.removeMissingProject()
            }
          />
        </div>
        {!started && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background text-primary"
            data-tauri-drag-region
          >
            {appError || startup?.error ? (
              <div role="alert" className="max-w-lg px-4">
                <StatusBanner
                  title={t("common.dataOutOfDate")}
                  description={appError || startup?.error || ""}
                  actionLabel={t("common.retry")}
                  onAction={appError ? refreshAppData : startup?.retry}
                  tone="danger"
                />
              </div>
            ) : (
              <div
                role="status"
                className="flex items-center gap-2 text-sm text-muted"
              >
                <Loader2
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                />
                {t("common.loading")}
              </div>
            )}
          </div>
        )}
      </WorkspaceFilesProvider>
    </SidebarVisibilityContext.Provider>
  );
}
