import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AddProjectDialog } from "./AddProjectDialog";
import { useApplicationMenu } from "../hooks/useApplicationMenu";
import { SidebarVisibilityContext } from "../hooks/sidebarVisibility";
import { Sidebar } from "./Sidebar";
import { StatusBanner } from "./StatusBanner";
import { CommandPalette } from "./CommandPalette";
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

export function Layout() {
  const { t } = useTranslation();
  const { appError, refreshAppData, refreshProjects } = useApp();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const workspacePage =
    !!projectWorkspaceRoute(pathname, search) || pathname === "/terminal";
  const projectSkillsPage =
    !!projectCheckoutRoute(pathname, search) && !workspacePage;
  const [gitSidebarVisible, setGitSidebarVisible] = useState(true);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [manageWorkspaces, setManageWorkspaces] = useState(false);
  useApplicationMenu(
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
  const discoveryPage = pathname === "/discover" || pathname === "/install";
  const fullHeightPage =
    projectSkillsPage ||
    discoveryPage ||
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
      }}
    >
      <WorkspaceFilesProvider>
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-primary">
          <WindowTitleBar onOpenCommands={() => setCommandsOpen(true)} />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <Sidebar />
            <div
              ref={setSidebarContainer}
              hidden={
                pathname !== "/git" ||
                resourcePanelVisible ||
                !gitSidebarVisible
              }
              className={cn(
                "min-h-0 shrink-0",
                pathname === "/git" &&
                  !resourcePanelVisible &&
                  gitSidebarVisible
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
                  pathname === "/git" || discoveryPage || projectSkillsPage
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
                  {pathname !== "/git" && <Outlet />}
                </div>
              </div>
            </div>
            <ProjectWorkspace
              page={pathname === "/git" ? <Outlet /> : undefined}
            />
          </div>
          <WorkbenchStatusBar
            branchRef={setBranchContainer}
            statusRef={setStatusContainer}
          />
          <AddProjectDialog
            open={manageWorkspaces}
            onClose={() => setManageWorkspaces(false)}
            onAdded={refreshProjects}
          />
          <CommandPalette open={commandsOpen} onOpenChange={setCommandsOpen} />
        </div>
      </WorkspaceFilesProvider>
    </SidebarVisibilityContext.Provider>
  );
}
