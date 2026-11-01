import { useState, useEffect, useId, useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PanelLeftClose } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../utils";
import { useApp } from "../context/AppContext";
import { ResizableSidebar } from "./ResizableSidebar";
import { SidebarVisibilityContext } from "../hooks/sidebarVisibility";
import { ConfirmDialog } from "./ConfirmDialog";
import { useSidebarSections } from "../hooks/useSidebarSections";
import { SidebarAgentWorkspaces } from "./SidebarAgentWorkspaces";
import * as api from "../lib/tauri";
import { ProjectSwitcher } from "./worktree/ProjectSwitcher";
import { SidebarSkillGroups } from "./SidebarSkillGroups";
import { SidebarProjectFiles } from "./worktree/SidebarProjectFiles";
import { activeSidebarPanel, type SidebarPanel } from "../lib/sidebarSections";
import { worktreeUrl } from "../lib/worktreeApi";
import { WorkspaceSearch } from "./search/WorkspaceSearch";
import { SidebarActivityBar } from "./SidebarActivityBar";
import { useActiveWorkspace } from "../hooks/useActiveWorkspace";
import { useGitChangeCount } from "../hooks/useGitChangeCount";

const PANEL_STORAGE_KEY = "agent-hub:sidebar-panel-open";

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    projects,
    refreshProjects,
    tools,
    appUpdate,
    closeSkillDetail,
    setViewedSkillGroupId,
    setViewingUngrouped,
  } = useApp();
  const { project: activeProject, path: activePath } =
    useActiveWorkspace(projects);
  const gitChanges = useGitChangeCount(activeProject?.id, activePath);
  const panelId = useId();
  const setResourcePanelVisible = useContext(
    SidebarVisibilityContext,
  )?.setResourcePanelVisible;
  const [panelWidth, setPanelWidth] = useState(280);
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      return localStorage.getItem(PANEL_STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [panelSelection, setPanelSelection] = useState({
    routeKey: location.key,
    panel: activeSidebarPanel(location.pathname) ?? "skills",
    manual: false,
  });
  if (panelSelection.routeKey !== location.key) {
    setPanelSelection({
      routeKey: location.key,
      panel:
        panelSelection.panel === "search" &&
        location.pathname.startsWith("/project/")
          ? "search"
          : (activeSidebarPanel(location.pathname) ?? "skills"),
      manual:
        panelSelection.panel === "search" &&
        location.pathname.startsWith("/project/"),
    });
  }
  const selectedPanel = panelSelection.panel;
  const [searchOpened, setSearchOpened] = useState(false);
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const panelVisible =
    panelOpen &&
    (activeSidebarPanel(location.pathname) !== null || panelSelection.manual);
  useEffect(() => {
    setResourcePanelVisible?.(panelVisible);
  }, [setResourcePanelVisible, panelVisible]);
  const selectPanel = (panel: SidebarPanel) => {
    if (selectedPanel === panel && panelVisible) {
      togglePanel();
      return;
    }
    if (panel === "skills") {
      closeSkillDetail();
      setViewedSkillGroupId("");
      setViewingUngrouped(false);
      if (location.pathname !== "/my-skills") navigate("/my-skills");
    }
    if (panel === "search") {
      setSearchOpened(true);
      setSearchFocusRequest((value) => value + 1);
    }
    setPanelSelection({ routeKey: location.key, panel, manual: true });
    setPanelOpen(true);
    if (panel === "projects" && !location.pathname.startsWith("/project/")) {
      if (activeProject && activePath)
        navigate(worktreeUrl(activeProject.id, activePath));
    }
    try {
      localStorage.setItem(PANEL_STORAGE_KEY, "true");
    } catch {
      /* Keep navigation available without storage. */
    }
  };
  const togglePanel = () => {
    const next = !panelOpen;
    setPanelOpen(next);
    try {
      localStorage.setItem(PANEL_STORAGE_KEY, String(next));
    } catch {
      // Keep navigation usable when browser storage is unavailable.
    }
  };
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const { expandedSection, toggleSection } = useSidebarSections(
    location.pathname,
  );

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-sidebar-width",
      panelVisible
        ? `calc(${panelWidth + 4}px + var(--app-activitybar-width))`
        : location.pathname === "/git"
          ? "var(--app-activitybar-width)"
          : "calc(var(--app-activitybar-width) + 4px)",
    );
    return () => {
      document.documentElement.style.setProperty("--app-sidebar-width", "0px");
    };
  }, [panelVisible, panelWidth, location.pathname]);

  useEffect(() => {
    const openSearch = (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        (!(event.metaKey || event.ctrlKey) ||
          !event.shiftKey ||
          event.key.toLowerCase() !== "f")
      )
        return;
      event.preventDefault();
      setSearchOpened(true);
      setSearchFocusRequest((value) => value + 1);
      setPanelSelection({
        routeKey: location.key,
        panel: "search",
        manual: true,
      });
      setPanelOpen(true);
      try {
        localStorage.setItem(PANEL_STORAGE_KEY, "true");
      } catch {
        /* Session state still works. */
      }
    };
    window.addEventListener("keydown", openSearch);
    window.addEventListener("workspace-search-open", openSearch);
    return () => {
      window.removeEventListener("keydown", openSearch);
      window.removeEventListener("workspace-search-open", openSearch);
    };
  }, [location.key]);

  const handleDeleteProject = async () => {
    if (!deleteProjectTarget) return;
    await api.removeProject(deleteProjectTarget.id);
    await refreshProjects();
    if (location.pathname.startsWith("/project/")) {
      navigate("/");
    }
    toast.success(t("project.removed"));
  };

  return (
    <>
      <div
        className={cn(
          "workbench-sidebar-group relative z-10 flex h-full shrink-0 select-none",
          (panelVisible || location.pathname !== "/git") && "pr-1",
        )}
      >
        <SidebarActivityBar
          gitChanges={gitChanges}
          panelOpen={panelVisible}
          panelId={panelId}
          selectedPanel={selectedPanel}
          manualSelection={panelSelection.manual}
          onSelectPanel={selectPanel}
          updateVersion={
            appUpdate?.has_update ? appUpdate.latest_version : undefined
          }
        />
        <ResizableSidebar
          storageKey="agent-hub:sidebar-width"
          label={t(
            selectedPanel === "search"
              ? "workspaceSearch.title"
              : selectedPanel === "projects"
                ? "sidebar.projects"
                : "sidebar.skillPanel",
          )}
          reserveWidth={360}
          onWidthChange={setPanelWidth}
          id={panelId}
          hidden={!panelVisible}
          className="workbench-sidebar-panel"
        >
          <div
            hidden={selectedPanel !== "skills"}
            className={cn(
              "h-9 shrink-0 items-center justify-between gap-1 px-3",
              selectedPanel !== "skills" ? "hidden" : "flex",
            )}
          >
            <span className="truncate text-xs font-semibold text-secondary">
              {t(
                selectedPanel === "projects"
                  ? "sidebar.projects"
                  : "sidebar.skillPanel",
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                togglePanel();
                document
                  .querySelector<HTMLButtonElement>(
                    `button[data-sidebar-panel="${selectedPanel}"]`,
                  )
                  ?.focus();
              }}
              title={t(
                selectedPanel === "projects"
                  ? "sidebar.hideProjectPanel"
                  : "sidebar.hideSkillPanel",
              )}
              aria-label={t(
                selectedPanel === "projects"
                  ? "sidebar.hideProjectPanel"
                  : "sidebar.hideSkillPanel",
              )}
              className="app-button-ghost shrink-0 rounded p-1"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>
          <div hidden={selectedPanel !== "projects"} className="shrink-0">
            <ProjectSwitcher onRemove={setDeleteProjectTarget} />
          </div>
          <div
            hidden={selectedPanel !== "search"}
            className={cn(
              "min-h-0 flex-1 flex-col",
              selectedPanel === "search" ? "flex" : "hidden",
            )}
          >
            {searchOpened && (
              <WorkspaceSearch
                focusRequest={searchFocusRequest}
                active={panelVisible && selectedPanel === "search"}
                onHide={() => {
                  togglePanel();
                  document
                    .querySelector<HTMLButtonElement>(
                      'button[data-sidebar-panel="search"]',
                    )
                    ?.focus();
                }}
              />
            )}
          </div>
          <div
            hidden={selectedPanel === "search"}
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2",
              selectedPanel === "search" && "hidden",
            )}
          >
            <div hidden={selectedPanel !== "projects"}>
              <SidebarProjectFiles />
            </div>
            <div hidden={selectedPanel !== "skills"}>
              <SidebarSkillGroups
                isOpen={expandedSection === "skills"}
                onToggle={() => toggleSection("skills")}
              />
              <SidebarAgentWorkspaces
                tools={tools}
                isOpen={expandedSection === "agents"}
                onToggle={() => toggleSection("agents")}
              />
            </div>
          </div>
        </ResizableSidebar>
      </div>

      <ConfirmDialog
        open={deleteProjectTarget !== null}
        message={t("project.removeConfirm", {
          name: deleteProjectTarget?.name || "",
        })}
        onClose={() => setDeleteProjectTarget(null)}
        onConfirm={handleDeleteProject}
      />
    </>
  );
}
