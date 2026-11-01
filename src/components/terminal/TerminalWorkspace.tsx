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
import * as api from "../../lib/tauri";
import { terminalTaskRequest } from "../../lib/taskContext";
import { getErrorMessage } from "../../lib/error";
import type { Project } from "../../lib/tauri";
import { ThemedSelect } from "../ThemedSelect";
import { TerminalPane, type PaneControl } from "./TerminalPane";
import { TerminalPanelTools } from "./TerminalPanelTools";
import { useHerdrShortcut } from "./useHerdrShortcut";
import { cn } from "../../utils";
import { projectWorkspaceRoute, worktreeUrl } from "../../lib/worktreeApi";
import {
  createTerminalTab as createTab,
  terminalScopeKey,
  TERMINAL_PANE_LIMIT,
  type TerminalTab as Tab,
} from "../../lib/terminalLayout";
import { useTerminalLayout } from "./useTerminalLayout";
import { TerminalSessions } from "./TerminalSessions";
import { TerminalTabs } from "./TerminalTabs";
import { useActiveWorkspace } from "../../hooks/useActiveWorkspace";
import { TerminalStatus } from "./TerminalStatus";
import { TerminalTaskContextPanel } from "./TerminalTaskContextPanel";
import { TerminalNewMenu } from "./TerminalNewMenu";
import type { HerdrAgent } from "../../lib/herdrAgents";

interface Props {
  projects: Project[];
  shown?: boolean;
  projectsReady?: boolean;
  toolbar?: ReactNode;
  toolbarEnd?: ReactNode;
  onProjectSkills?: () => void;
  extraTabs?: ReactNode;
  content?: ReactNode;
  onSelectTerminal?: () => void;
}
const toolbarAction = "app-button-ghost h-7 w-7 shrink-0 p-0";

export function TerminalWorkspace({
  projects,
  shown = true,
  projectsReady = true,
  toolbar,
  toolbarEnd,
  onProjectSkills,
  extraTabs,
  content,
  onSelectTerminal,
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
    activeIds,
    setActiveIds,
    ready,
    error: restoreError,
    retry,
    rememberActive,
  } = useTerminalLayout(projects, projectsReady, {
    projectId: scopedProject,
    path: scopedPath,
    initialize: visible && !terminalTaskRequest(location.state),
  });
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
  const consumed = useRef("");
  const initialized = useRef(false);
  const [bridgeError, setBridgeError] = useState("");
  const [contextVisible, setContextVisible] = useState(false);
  useEffect(() => {
    const request = terminalTaskRequest(location.state);
    if (!ready || !visible || !request || consumed.current === location.key)
      return;
    let cancelled = false;
    void api
      .resolveTerminalProject(request.projectId, scopedPath)
      .then(() => {
        if (cancelled) return;
        consumed.current = location.key;
        initialized.current = true;
        setBridgeError("");
        const existing = tabsRef.current.find(
          (tab) =>
            tab.projectId === request.projectId &&
            (tab.worktreePath ??
              projects.find((project) => project.id === request.projectId)
                ?.path) ===
              (scopedPath ??
                projects.find((project) => project.id === request.projectId)
                  ?.path),
        );
        if (existing) {
          setTabs((previous) =>
            previous.map((tab) =>
              tab.id === existing.id
                ? { ...tab, context: request.context }
                : tab,
            ),
          );
          setActiveIds((previous) => ({
            ...previous,
            [scopeKey]: existing.id,
          }));
        } else {
          if (
            tabsRef.current.reduce((sum, tab) => sum + tab.panes.length, 0) >=
            TERMINAL_PANE_LIMIT
          ) {
            setBridgeError(t("worktree.terminalLimit"));
            return;
          }
          const tab = createTab(
            request.projectId,
            request.context,
            scopedPath ??
              projects.find((project) => project.id === request.projectId)
                ?.path,
          );
          setTabs((previous) => [...previous, tab]);
          setActiveIds((previous) => ({ ...previous, [scopeKey]: tab.id }));
        }
        setProjectId(request.projectId);
        setContextVisible(false);
        navigate(`${location.pathname}${location.search}`, {
          replace: true,
          state: null,
        });
      })
      .catch((error) => {
        if (!cancelled)
          setBridgeError(getErrorMessage(error, t("common.error")));
      });
    return () => {
      cancelled = true;
    };
  }, [
    location.key,
    location.pathname,
    location.search,
    location.state,
    visible,
    navigate,
    t,
    scopedPath,
    scopeKey,
    ready,
    projects,
    setTabs,
    setActiveIds,
  ]);
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
      initialized.current ||
      !selected ||
      terminalTaskRequest(location.state)
    )
      return;
    let cancelled = false;
    void api
      .resolveTerminalProject(selected)
      .then(() => {
        if (cancelled || initialized.current) return;
        initialized.current = true;
        const existing = tabsRef.current.at(-1);
        if (existing) {
          setActiveIds((previous) => ({
            ...previous,
            [scopeKey]: existing.id,
          }));
          setProjectId(existing.projectId);
          return;
        }
        const tab = createTab(
          selected,
          undefined,
          projects.find((project) => project.id === selected)?.path,
        );
        setTabs((previous) => [...previous, tab]);
        setActiveIds((previous) => ({ ...previous, [scopeKey]: tab.id }));
        setProjectId(selected);
      })
      .catch((error) => {
        if (!cancelled)
          setBridgeError(getErrorMessage(error, t("common.error")));
      });
    return () => {
      cancelled = true;
    };
  }, [
    visible,
    legacy,
    selected,
    location.state,
    t,
    scopeKey,
    ready,
    projects,
    setTabs,
    setActiveIds,
  ]);
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
  );
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
        herdr.notice ||
        projects.find(
          (project) => project.id === (active?.projectId ?? scopedProject),
        )?.name ||
        t("terminal.title")
      }
      notice={bridgeError || herdr.notice}
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
        <div className="flex h-9 shrink-0 flex-nowrap items-center gap-1 border-b border-border bg-bg-secondary px-2">
          <TerminalTabs
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
            {shown && (
              <TerminalNewMenu
                disabled={
                  !ready ||
                  !(scopedProject || selected) ||
                  count >= TERMINAL_PANE_LIMIT
                }
                onNew={add}
              />
            )}
            {extraTabs}
          </TerminalTabs>
          {!workspace && (
            <ThemedSelect
              aria-label={t("terminal.chooseProject")}
              value={selected}
              title={projects.find((project) => project.id === selected)?.name}
              onChange={(event) => setProjectId(event.target.value)}
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
              herdrBusy={herdr.busy}
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
              onHerdr={() => void herdr.launch()}
              onHerdrSidebar={() => void herdr.toggleSidebar()}
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
                  tab.activePane === pane
                    ? "border-accent"
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
                  projectId={tab.projectId}
                  worktreePath={tab.worktreePath}
                  agent={tab.agent}
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
        {statusContainer
          ? visible && createPortal(statusBar, statusContainer)
          : statusBar}
      </div>
    </section>
  );
}
