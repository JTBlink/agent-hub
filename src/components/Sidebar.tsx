import { useState, useEffect, useId, useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PanelLeftClose } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import { useApp } from "../context/AppContext";
import { ResizableSidebar } from "./ResizableSidebar";
import { SidebarVisibilityContext } from "../hooks/sidebarVisibility";
import { RemoveProjectDialog } from "./worktree/RemoveProjectDialog";
import { useSidebarSections } from "../hooks/useSidebarSections";
import { SidebarAgentWorkspaces } from "./SidebarAgentWorkspaces";
import { ProjectSwitcher } from "./worktree/ProjectSwitcher";
import { SidebarSkillGroups } from "./SidebarSkillGroups";
import { SidebarProjectFiles } from "./worktree/SidebarProjectFiles";
import { activeSidebarPanel, type SidebarPanel } from "../lib/sidebarSections";
import { projectWorkspaceRoute, worktreeUrl } from "../lib/worktreeApi";
import { WorkspaceSearch } from "./search/WorkspaceSearch";
import { SidebarActivityBar } from "./SidebarActivityBar";
import { useActiveWorkspace } from "../hooks/useActiveWorkspace";
import { useGitChangeCount } from "../hooks/useGitChangeCount";
import { featureModules } from "@app/features";
import { productConfig } from "@app/product";

const PANEL_STORAGE_KEY = "agent-hub:sidebar-panel-open";

export function Sidebar() {
  const defaultPanel: SidebarPanel = productConfig.sidebar.defaultPanel;
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const preserveSidebar = location.state?.preserveSidebar === true;
  const {
    projects,
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
  const sidebarVisibility = useContext(SidebarVisibilityContext);
  const setResourcePanelVisible = sidebarVisibility?.setResourcePanelVisible;
  const setGitSidebarVisible = sidebarVisibility?.setGitSidebarVisible;
  const [gitSidebarState, setGitSidebarState] = useState({
    routeKey: location.key,
    open: true,
  });
  const gitSidebarOpen =
    gitSidebarState.routeKey !== location.key || gitSidebarState.open;
  useEffect(() => {
    setGitSidebarVisible?.(gitSidebarOpen);
  }, [gitSidebarOpen, setGitSidebarVisible]);
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
    panel: activeSidebarPanel(location.pathname) ?? defaultPanel,
    manual: false,
  });
  if (panelSelection.routeKey !== location.key) {
    setPanelSelection({
      routeKey: location.key,
      panel:
        preserveSidebar ||
        (panelSelection.panel === "search" &&
          location.pathname.startsWith("/project/"))
          ? panelSelection.panel
          : (activeSidebarPanel(location.pathname) ?? defaultPanel),
      manual:
        preserveSidebar ||
        (panelSelection.panel === "search" &&
          location.pathname.startsWith("/project/")),
    });
  }
  const selectedPanel = panelSelection.panel;
  const [searchOpened, setSearchOpened] = useState(false);
  const [openedFeatures, setOpenedFeatures] = useState<string[]>([
    defaultPanel,
  ]);
  const selectedFeature = featureModules.find(
    (feature) => feature.sidebar.id === selectedPanel,
  );
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const panelVisible =
    panelOpen &&
    (activeSidebarPanel(location.pathname) !== null || panelSelection.manual);
  useEffect(() => {
    setResourcePanelVisible?.(panelVisible);
  }, [setResourcePanelVisible, panelVisible]);
  const selectPanel = (panel: SidebarPanel) => {
    const switchToWorkspace =
      (location.pathname === "/settings" && panel !== "skills") ||
      (featureModules.find((feature) => feature.sidebar.id === panel)?.sidebar
        .workspace &&
        location.pathname !== "/terminal" &&
        !projectWorkspaceRoute(location.pathname, location.search));
    if (selectedPanel === panel && panelVisible && !switchToWorkspace) {
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
    if (featureModules.some((feature) => feature.sidebar.id === panel)) {
      setOpenedFeatures((opened) =>
        opened.includes(panel) ? opened : [...opened, panel],
      );
    }
    setPanelSelection({ routeKey: location.key, panel, manual: true });
    setPanelOpen(true);
    if (switchToWorkspace) {
      navigate(
        activeProject && activePath
          ? worktreeUrl(activeProject.id, activePath)
          : "/terminal",
        { state: { preserveSidebar: true } },
      );
    } else if (
      panel === "projects" &&
      !location.pathname.startsWith("/project/")
    ) {
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
    preserveSidebar,
  );

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-sidebar-width",
      panelVisible
        ? `calc(${panelWidth + 4}px + var(--app-activitybar-width))`
        : location.pathname === "/git" || location.pathname === "/settings"
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

  return (
    <>
      <div
        className={cn(
          "workbench-sidebar-group relative z-10 flex h-full shrink-0 select-none",
          (panelVisible ||
            (location.pathname !== "/git" &&
              location.pathname !== "/settings")) &&
            "pr-1",
        )}
      >
        <SidebarActivityBar
          gitChanges={gitChanges}
          gitSidebarOpen={gitSidebarOpen && !panelVisible}
          onSelectGit={() => {
            setGitSidebarState({
              routeKey: location.key,
              open: panelVisible || !gitSidebarOpen,
            });
            setPanelSelection((selection) => ({ ...selection, manual: false }));
          }}
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
            selectedFeature
              ? selectedFeature.sidebar.labelKey
              : selectedPanel === "search"
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
          {featureModules.map((feature) => {
            const Panel = feature.sidebar.component;
            const selected = selectedPanel === feature.sidebar.id;
            return (
              <div
                key={feature.id}
                hidden={!selected}
                className={cn(
                  "min-h-0 flex-1 flex-col",
                  selected ? "flex" : "hidden",
                )}
              >
                {openedFeatures.includes(feature.sidebar.id) && (
                  <Panel active={panelVisible && selected} />
                )}
              </div>
            );
          })}
          <div
            hidden={selectedPanel === "search" || !!selectedFeature}
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2",
              (selectedPanel === "search" || !!selectedFeature) && "hidden",
            )}
          >
            <div hidden={selectedPanel !== "projects"}>
              <SidebarProjectFiles changes={gitChanges} />
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

      <RemoveProjectDialog
        project={deleteProjectTarget}
        onClose={() => setDeleteProjectTarget(null)}
      />
    </>
  );
}
