import { createPortal } from "react-dom";
import { SidebarVisibilityContext } from "../../hooks/sidebarVisibility";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { terminalTaskRequest } from "../../lib/taskContext";
import { getErrorMessage } from "../../lib/error";
import type { Project, ToolInfo } from "../../lib/tauri";
import { ThemedSelect } from "../ThemedSelect";
import { TerminalPane, type PaneControl } from "./TerminalPane";
import { TerminalPanelTools } from "./TerminalPanelTools";
import { useHerdrShortcut } from "./useHerdrShortcut";
import { useHerdrSessions } from "./useHerdrSessions";
import { cn } from "../../utils";
import { projectWorkspaceRoute, worktreeUrl } from "../../lib/worktreeApi";
import {
  createTerminalTab as createTab,
  terminalScopeKey,
  TERMINAL_PANE_LIMIT,
  type TerminalTab as Tab,
} from "../../lib/terminalLayout";
import {
  useTerminalLayout,
  type TerminalStartupState,
} from "./useTerminalLayout";
import { TerminalSessions } from "./TerminalSessions";
import { TerminalTabs } from "./TerminalTabs";
import { useActiveWorkspace } from "../../hooks/useActiveWorkspace";
import { TerminalStatus } from "./TerminalStatus";
import { TerminalTaskContextPanel } from "./TerminalTaskContextPanel";
import { TerminalNewMenu } from "./TerminalNewMenu";
import type { HerdrAgent } from "../../lib/herdrAgents";
import { herdrNavigation } from "../../lib/herdrControlApi";
import { useTerminalTaskRequest } from "./useTerminalTaskRequest";
import { useHerdrAttachment } from "./useHerdrAttachment";
import { LocalTerminalTools } from "./TerminalActionBar";
import { HerdrTerminalTools } from "./HerdrTerminalTools";

interface Props {
  projects: Project[];
  tools?: readonly ToolInfo[];
  shown?: boolean;
  projectsReady?: boolean;
  toolbar?: ReactNode;
  toolbarEnd?: ReactNode;
  onProjectSkills?: () => void;
  extraTabs?: ReactNode;
  content?: ReactNode;
  onSelectTerminal?: () => void;
  onStartupStateChange?: (state: TerminalStartupState) => void;
}
const toolbarAction = "app-button-ghost h-7 w-7 shrink-0 p-0";

export function TerminalWorkspace({
  projects,
  tools = [],
  shown = true,
  projectsReady = true,
  toolbar,
  toolbarEnd,
  onProjectSkills,
  extraTabs,
  content,
  onSelectTerminal,
  onStartupStateChange,
}: Props) {
  const { t } = useTranslation();
  const statusContainer = useContext(SidebarVisibilityContext)?.statusContainer;
  const location = useLocation();
  const navigate = useNavigate();
  const activeWorkspace = useActiveWorkspace(projects);
  const gitPage = location.pathname === "/git";
  const workspace =
    projectWorkspaceRoute(location.pathname, location.search) ??
    (gitPage && activeWorkspace.project
      ? {
          projectId: activeWorkspace.project.id,
          worktreePath: activeWorkspace.path,
        }
      : null);
  const scopedProject = workspace?.projectId;
  const scopedPath = workspace
    ? (workspace.worktreePath ??
      projects.find((project) => project.id === scopedProject)?.path)
    : undefined;
  const legacy = location.pathname === "/terminal";
  const workspaceVisible = legacy || gitPage || !!workspace;
  const visible = shown && workspaceVisible;
  const panelVisible = workspaceVisible && (shown || !!content);
  const [projectId, setProjectId] = useState("");
  const {
    tabs,
    scopedTabs,
    setTabs,
    renameTab,
    activeIds,
    setActiveIds,
    ready,
    startupReady,
    error: restoreError,
    retry,
    rememberActive,
  } = useTerminalLayout(projects, projectsReady, {
    projectId: scopedProject,
    path: scopedPath,
    initialize:
      visible &&
      !terminalTaskRequest(location.state) &&
      !herdrNavigation(location.state),
  });
  useEffect(() => {
    onStartupStateChange?.({ ready: startupReady, error: restoreError, retry });
  }, [startupReady, restoreError, retry, onStartupStateChange]);
  const scopeKey = workspace ? terminalScopeKey(scopedProject, scopedPath) : "";
  const activeId = activeIds[scopeKey] ?? "";
  const setActiveId = (id: string) => {
    rememberActive(id);
    setActiveIds((previous) => ({ ...previous, [scopeKey]: id }));
  };
  const controls = useRef(new Map<string, PaneControl>());
  const activeTarget = useRef<PaneControl | null>(null);
  const tabsRef = useRef(tabs);
  useLayoutEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  const initialized = useRef(false);
  const [bridgeError, setBridgeError] = useState("");
  const [contextVisible, setContextVisible] = useState(false);
  const [zoomedPane, setZoomedPane] = useState("");
  useHerdrAttachment({
    ready,
    visible,
    projectId: scopedProject,
    path: scopedPath,
    tabs: tabsRef,
    setTabs,
    setActiveIds,
    rememberActive,
    initializedRef: initialized,
    onError: setBridgeError,
    onSelectTerminal,
  });
  useTerminalTaskRequest({
    ready,
    visible,
    projectId: scopedProject,
    path: scopedPath,
    projects,
    tabs: tabsRef,
    setTabs,
    setActiveIds,
    initializedRef: initialized,
    onError: setBridgeError,
    setProjectId,
    setContextVisible,
  });

  const recent = projects.reduce<Project | undefined>(
    (latest, project) =>
      !latest || (project.visited_at ?? 0) > (latest.visited_at ?? 0)
        ? project
        : latest,
    undefined,
  );
  const selected = projectId || recent?.id || "";
  useEffect(() => {
    if (
      !visible ||
      !ready ||
      !legacy ||
      tabs.length ||
      terminalTaskRequest(location.state) ||
      herdrNavigation(location.state)
    )
      return;
    const request: unknown = location.state;
    const requestedId =
      typeof request === "object" &&
      request !== null &&
      "projectId" in request &&
      typeof request.projectId === "string"
        ? request.projectId
        : undefined;
    const requested = projects.find((project) => project.id === requestedId);
    navigate(requested ? worktreeUrl(requested.id, requested.path) : "/", {
      replace: true,
    });
  }, [visible, ready, legacy, tabs.length, location.state, projects, navigate]);
  const active =
    scopedTabs.find((tab) => tab.id === activeId) ?? scopedTabs.at(-1);
  const displayedId = active?.id ?? "";
  const count = tabs.reduce((sum, tab) => sum + tab.panes.length, 0);
  useLayoutEffect(() => {
    activeTarget.current =
      visible && active
        ? (controls.current.get(active.activePane) ?? null)
        : null;
  }, [active, visible]);
  useLayoutEffect(() => {
    if (visible && active) rememberActive(active.id);
  }, [visible, active, rememberActive]);
  const herdr = useHerdrShortcut(
    () => activeTarget.current,
    `${visible}:${activeId}:${active?.activePane ?? ""}`,
    visible,
  );
  const herdrSessions = useHerdrSessions(
    visible,
    active,
    () => activeTarget.current,
    setTabs,
  );
  const activeHerdrTarget = herdrSessions.target ?? active?.herdrTarget;
  const add = (agent?: HerdrAgent) => {
    if (!ready || !(scopedProject || selected) || count >= TERMINAL_PANE_LIMIT)
      return;
    onSelectTerminal?.();
    initialized.current = true;
    const target = scopedProject || selected;
    const tab = createTab(
      target,
      undefined,
      scopedPath ?? projects.find((project) => project.id === target)?.path,
    );
    tab.agent = agent;
    setTabs((previous) => [...previous, tab]);
    setActiveId(tab.id);
  };
  const split = (direction: Tab["direction"]) => {
    if (
      !ready ||
      !active ||
      active.agent ||
      active.panes.length >= 2 ||
      count >= TERMINAL_PANE_LIMIT
    )
      return;
    const pane = crypto.randomUUID();
    setTabs((previous) =>
      previous.map((tab) =>
        tab.id === displayedId
          ? { ...tab, panes: [...tab.panes, pane], activePane: pane, direction }
          : tab,
      ),
    );
  };
  const close = (tab: Tab, pane?: string) => {
    const remaining = pane ? tab.panes.filter((id) => id !== pane) : [];
    if (remaining.length) {
      setTabs((previous) =>
        previous.map((item) =>
          item.id === tab.id
            ? { ...item, panes: remaining, activePane: remaining[0] }
            : item,
        ),
      );
    } else {
      const next = tabs.filter((item) => item.id !== tab.id);
      setTabs(next);
      if (displayedId === tab.id)
        setActiveId(
          scopedTabs.filter((item) => item.id !== tab.id).at(-1)?.id || "",
        );
    }
  };
  const selectSession = (tab: Tab) => {
    rememberActive(tab.id);
    setActiveIds((previous) => ({
      ...previous,
      [terminalScopeKey(
        tab.projectId,
        tab.worktreePath ??
          projects.find((project) => project.id === tab.projectId)?.path,
      )]: tab.id,
    }));
    navigate(worktreeUrl(tab.projectId, tab.worktreePath));
  };
  const statusBar = (
    <TerminalStatus
      message={
        bridgeError ||
        herdrSessions.notice ||
        herdr.notice ||
        projects.find(
          (project) => project.id === (active?.projectId ?? scopedProject),
        )?.name ||
        t("terminal.title")
      }
      error={!!(bridgeError || herdrSessions.notice)}
      notice={bridgeError || herdrSessions.notice || herdr.notice}
    />
  );
  return (
    <section
      aria-label={t("terminal.title")}
      hidden={!panelVisible}
      className={
        panelVisible
          ? cn("relative flex min-h-0 min-w-0 flex-1 flex-col")
          : "hidden"
      }
    >
      {toolbar ?? (
        <div className="flex h-9 shrink-0 flex-nowrap items-center overflow-x-auto gap-1 border-b border-border bg-bg-secondary px-2">
          <TerminalTabs
            onRename={renameTab}
            tabs={scopedTabs}
            projects={projects}
            activeId={shown ? displayedId : ""}
            scoped={!!workspace}
            onClose={close}
            onSelect={(tab) => {
              onSelectTerminal?.();
              setActiveId(tab.id);
              setProjectId(tab.projectId);
            }}
          >
            {extraTabs}
            {shown && (
              <TerminalNewMenu
                tools={tools}
                disabled={
                  !ready ||
                  !(scopedProject || selected) ||
                  count >= TERMINAL_PANE_LIMIT
                }
                onNew={add}
              />
            )}
          </TerminalTabs>
          {!workspace && (
            <ThemedSelect
              aria-label={t("terminal.chooseProject")}
              value={selected}
              title={projects.find((project) => project.id === selected)?.name}
              onChange={(event) => {
                const project = projects.find(
                  (item) => item.id === event.target.value,
                );
                if (project) navigate(worktreeUrl(project.id, project.path));
              }}
              className="h-7 max-w-40 gap-2 rounded-md border-transparent bg-transparent px-2 py-0 text-xs"
            >
              {!projects.length && (
                <option value="">{t("terminal.chooseProject")}</option>
              )}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </ThemedSelect>
          )}
          <div className="flex shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap">
            {shown && (
              <>
                <TerminalSessions
                  tabs={tabs}
                  projects={projects}
                  activeId={displayedId}
                  onSelect={selectSession}
                  onClose={close}
                />
                {active?.context && (
                  <button
                    type="button"
                    className={toolbarAction}
                    aria-label={t("tasks.context")}
                    title={active.context.title}
                    onClick={() => setContextVisible((value) => !value)}
                  >
                    <FileText size={15} />
                  </button>
                )}
              </>
            )}
            {toolbarEnd}
            <TerminalPanelTools
              showTerminalActions={shown}
              onProjectSkills={onProjectSkills}
              key={`${visible}:${activeId}:${active?.panes.length ?? 0}`}
              hasTerminal={shown && !!active && !active.agent}
              herdrBusy={herdr.busy || herdrSessions.busy}
              updateVersion={
                herdr.update?.has_update
                  ? herdr.update.latest_version
                  : undefined
              }
              onHerdrUpgrade={() => void herdr.upgrade()}
              canSplit={
                shown &&
                ready &&
                !!active &&
                !active.agent &&
                active.panes.length < 2 &&
                count < TERMINAL_PANE_LIMIT
              }
              onHerdr={() => void herdrSessions.openDefault(herdr.launch)}
              onSplit={split}
            />
          </div>
        </div>
      )}
      {content}
      <div
        hidden={!shown}
        className={shown ? "relative flex min-h-0 flex-1 flex-col" : "hidden"}
      >
        {restoreError && (
          <div
            role="alert"
            className="flex items-center gap-2 px-2 py-1 text-xs text-danger"
          >
            <span className="min-w-0 flex-1">{restoreError}</span>
            <button type="button" className="app-button-ghost" onClick={retry}>
              {t("common.retry")}
            </button>
          </div>
        )}
        {!scopedTabs.length && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            {t(
              !ready
                ? "common.loading"
                : count >= TERMINAL_PANE_LIMIT
                  ? "worktree.terminalLimit"
                  : "terminal.chooseProject",
            )}
          </div>
        )}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            aria-label={
              projects.find((project) => project.id === tab.projectId)?.name ||
              t("terminal.title")
            }
            hidden={tab.id !== displayedId || !scopedTabs.includes(tab)}
            className={cn(
              tab.id === displayedId && scopedTabs.includes(tab)
                ? "flex"
                : "hidden",
              "min-h-0 flex-1",
              tab.direction === "vertical" && "flex-col",
            )}
          >
            {tab.panes.map((pane) => (
              <div
                key={pane}
                className={cn(
                  "relative flex min-h-0 min-w-0 flex-1 overflow-hidden border",
                  zoomedPane &&
                    tab.panes.includes(zoomedPane) &&
                    pane !== zoomedPane &&
                    "hidden",
                  tab.activePane === pane
                    ? "border-accent-border"
                    : "border-border-subtle",
                )}
                onFocusCapture={() =>
                  setTabs((previous) =>
                    previous.map((item) =>
                      item.id === tab.id && item.activePane !== pane
                        ? { ...item, activePane: pane }
                        : item,
                    ),
                  )
                }
              >
                {tab.panes.length > 1 && (
                  <button
                    type="button"
                    className="app-button-ghost absolute right-1 top-1 z-10"
                    aria-label={t("terminal.closePane")}
                    onClick={() => close(tab, pane)}
                  >
                    <X size={12} />
                  </button>
                )}
                <TerminalPane
                  {...herdrSessions.paneProps(tab, pane)}
                  visible={visible && displayedId === tab.id}
                  active={
                    visible && displayedId === tab.id && tab.activePane === pane
                  }
                  onReady={(control) => {
                    if (control) {
                      controls.current.set(pane, control);
                      if (
                        visible &&
                        displayedId === tab.id &&
                        tab.activePane === pane
                      )
                        activeTarget.current = control;
                    } else {
                      const previous = controls.current.get(pane);
                      controls.current.delete(pane);
                      if (activeTarget.current === previous)
                        activeTarget.current = null;
                    }
                  }}
                />
              </div>
            ))}
          </div>
        ))}
        {contextVisible && active?.context && (
          <TerminalTaskContextPanel
            context={active.context}
            onClose={() => setContextVisible(false)}
            onDismiss={() => {
              setContextVisible(false);
              controls.current.get(active.activePane)?.focus();
            }}
            onError={(error) =>
              setBridgeError(getErrorMessage(error, t("common.error")))
            }
          />
        )}
        {shown && active && !activeHerdrTarget && (
          <LocalTerminalTools
            current={() => activeTarget.current}
            onNew={() => add()}
            onSplit={split}
            onClose={() => close(active, active.activePane)}
            onSidebar={herdr.toggleSidebar}
            onError={setBridgeError}
            zoomed={zoomedPane === active.activePane}
            onZoom={() =>
              setZoomedPane((value) =>
                value === active.activePane ? "" : active.activePane,
              )
            }
            canSplit={
              !active.agent &&
              active.panes.length < 2 &&
              count < TERMINAL_PANE_LIMIT
            }
            canAdd={count < TERMINAL_PANE_LIMIT}
            canZoom={active.panes.length > 1}
          />
        )}
        {shown && activeHerdrTarget && (
          <HerdrTerminalTools
            target={activeHerdrTarget}
            current={() => activeTarget.current}
            onError={setBridgeError}
            onOpen={(opened) =>
              navigate(worktreeUrl(opened.project_id, opened.path), {
                state: { preserveSidebar: true, herdrAttachment: opened },
              })
            }
          />
        )}
        {statusContainer
          ? visible && createPortal(statusBar, statusContainer)
          : statusBar}
      </div>
    </section>
  );
}
