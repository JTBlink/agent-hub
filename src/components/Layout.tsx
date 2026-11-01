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
import { projectWorkspaceRoute } from "../lib/worktreeApi";
import { cn } from "../utils";
import { WorkspaceFilesProvider } from "./worktree/WorkspaceFilesContext";

export function Layout() {
  const { t } = useTranslation();
  const { appError, refreshAppData, refreshProjects } = useApp();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const workspacePage =
    !!projectWorkspaceRoute(pathname, search) || pathname === "/terminal";
  const [terminalMaximized, setTerminalMaximized] = useState(false);
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
  const [resourcePanelVisible, setResourcePanelVisible] = useState(false);
  const hideSidebar = workspacePage && terminalMaximized;
  const fullHeightPage =
    pathname === "/settings" ||
    pathname === "/backup/diff" ||
    pathname === "/tasks" ||
    pathname === "/git";

  // Cmd+, to open Settings
  useEffect(() => {
    const revealSearch = () => {
      if (!hideSidebar) return;
      setTerminalMaximized(false);
      requestAnimationFrame(() =>
        window.dispatchEvent(new Event("workspace-search-open")),
      );
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        revealSearch();
      }
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
    window.addEventListener("workspace-search-open", revealSearch);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("workspace-search-open", revealSearch);
    };
  }, [navigate, refreshAppData, hideSidebar]);

  return (
    <SidebarVisibilityContext.Provider
      value={{
        resourcePanelVisible,
        setResourcePanelVisible,
        sidebarContainer,
        statusContainer,
      }}
    >
      <WorkspaceFilesProvider>
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-primary">
          <WindowTitleBar onOpenCommands={() => setCommandsOpen(true)} />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {!hideSidebar && <Sidebar />}
            <div
              ref={setSidebarContainer}
              hidden={pathname !== "/git" || resourcePanelVisible}
              className={cn(
                "min-h-0 shrink-0",
                pathname === "/git" && !resourcePanelVisible
                  ? "flex"
                  : "hidden",
              )}
            />
            <div
              className={cn(
                "workbench-editor-panel relative min-w-0 flex-1 flex-col overflow-hidden mr-1",
                workspacePage ? "hidden" : "flex",
              )}
            >
              <div
                className={cn(
                  "min-h-0 flex-1 scrollbar-hide",
                  pathname === "/git" ? "p-0" : "p-5",
                  fullHeightPage
                    ? "flex flex-col overflow-hidden"
                    : "overflow-y-auto",
                )}
              >
                <div
                  className={cn(
                    "mx-auto flex w-full flex-col gap-4",
                    pathname === "/tasks" || pathname === "/git"
                      ? "max-w-none"
                      : "max-w-[1200px]",
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
                  <Outlet />
                </div>
              </div>
            </div>
            <ProjectWorkspace onMaximizedChange={setTerminalMaximized} />
          </div>
          <footer className="workbench-statusbar flex shrink-0 items-center gap-3 border-t border-border-subtle bg-bg-secondary px-2 text-xs text-muted">
            <div
              ref={setStatusContainer}
              className="workbench-status-content flex min-w-0 flex-1 items-center"
            />
            <span className="workbench-status-fallback truncate">
              {t("app.name")}
            </span>
          </footer>
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
