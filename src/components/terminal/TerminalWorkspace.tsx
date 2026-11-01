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
import { Plus, X, FileText, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
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
import { TerminalStatus } from "./TerminalStatus";

interface Props {
  projects: Project[];
  onMaximizedChange: (maximized: boolean) => void;
  shown?: boolean;
  projectsReady?: boolean;
  toolbarEnd?: ReactNode;
  extraTabs?: ReactNode;
  content?: ReactNode;
  onSelectTerminal?: () => void;
}
const toolbarAction = "app-button-ghost h-7 w-7 shrink-0 p-0";

export function TerminalWorkspace({
  projects,
  onMaximizedChange,
  shown = true,
  projectsReady = true,
  toolbarEnd,
  extraTabs,
  content,
  onSelectTerminal,
}: Props) {
  const { t } = useTranslation();
  const statusContainer = useContext(SidebarVisibilityContext)?.statusContainer;
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = projectWorkspaceRoute(location.pathname, location.search);
  const scopedProject = workspace?.projectId;
  const scopedPath = workspace
    ? (workspace.worktreePath ??
      projects.find((project) => project.id === scopedProject)?.path)
    : undefined;
  const legacy = location.pathname === "/terminal";
  const workspaceVisible = legacy || !!workspace;
  const visible = shown && workspaceVisible;
  const panelVisible = workspaceVisible && (shown || !!content);
  const [projectId, setProjectId] = useState("");
  const {
    tabs,
    setTabs,
    activeIds,
    setActiveIds,
    ready,
    error: restoreError,
    retry,
    rememberActive,
  } = useTerminalLayout(projects, projectsReady);
  const scopeKey = workspace ? terminalScopeKey(scopedProject, scopedPath) : "";
  const activeId = activeIds[scopeKey] ?? "";
  const setActiveId = (id: string) => {
    rememberActive(id);
    setActiveIds((previous) => ({ ...previous, [scopeKey]: id }));
  };
  const [maximized, setMaximized] = useState(false);
  const controls = useRef(new Map<string, PaneControl>());
  const activeTarget = useRef<PaneControl | null>(null);
  const tabsRef = useRef(tabs);
  useLayoutEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  const consumed = useRef("");
  const initialized = useRef(false);
  const [initializedScopes, setInitializedScopes] = useState<string[]>([]);
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
  const scopedTabs = workspace
    ? tabs.filter(
        (tab) =>
          tab.projectId === scopedProject && tab.worktreePath === scopedPath,
      )
    : tabs;
  const active =
    scopedTabs.find((tab) => tab.id === activeId) ?? scopedTabs.at(-1);
  const displayedId = active?.id ?? "";
  const count = tabs.reduce((sum, tab) => sum + tab.panes.length, 0);
  if (
    ready &&
    visible &&
    scopeKey &&
    scopedProject &&
    scopedPath &&
    !terminalTaskRequest(location.state) &&
    !initializedScopes.includes(scopeKey) &&
    (scopedTabs.length > 0 || count < TERMINAL_PANE_LIMIT)
  ) {
    setInitializedScopes([...initializedScopes, scopeKey]);
    if (!scopedTabs.length) {
      const tab = createTab(scopedProject, undefined, scopedPath);
      setTabs([...tabs, tab]);
      setActiveIds({ ...activeIds, [scopeKey]: tab.id });
    }
  }
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
  const add = () => {
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
    setTabs((previous) => [...previous, tab]);
    setActiveId(tab.id);
  };
  const split = (direction: Tab["direction"]) => {
    if (
      !ready ||
      !active ||
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
  const toggleMaximize = () => {
    const next = !maximized;
    setMaximized(next);
    onMaximizedChange(next);
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
      updateVersion={
        herdr.update?.has_update ? herdr.update.latest_version : undefined
      }
      busy={herdr.busy}
      onUpgrade={() => void herdr.upgrade()}
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
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-bg-secondary px-2">
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
        {toolbarEnd}
        <TerminalSessions
          tabs={tabs}
          projects={projects}
          activeId={displayedId}
          onSelect={selectSession}
          onClose={close}
        />
        <button
          type="button"
          className={toolbarAction}
          aria-label={t("terminal.new")}
          title={t("terminal.new")}
          disabled={
            !ready ||
            !(scopedProject || selected) ||
            count >= TERMINAL_PANE_LIMIT
          }
          onClick={add}
        >
          <Plus size={15} />
        </button>
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
        <TerminalPanelTools
          key={`${visible}:${activeId}:${active?.panes.length ?? 0}`}
          hasTerminal={shown && !!active}
          herdrBusy={herdr.busy}
          hasUpdate={!!herdr.update?.has_update}
          canSplit={
            shown &&
            ready &&
            !!active &&
            active.panes.length < 2 &&
            count < TERMINAL_PANE_LIMIT
          }
          maximized={maximized}
          onHerdr={() => void herdr.launch()}
          onHerdrSidebar={() => void herdr.toggleSidebar()}
          onSplit={split}
          onMaximize={toggleMaximize}
        />
      </div>
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
          <section
            aria-label={t("tasks.context")}
            className="absolute bottom-7 right-3 z-20 flex max-h-[calc(50vh/var(--app-scale))] w-[480px] max-w-[90%] flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-card"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setContextVisible(false);
                controls.current.get(active.activePane)?.focus();
              }
            }}
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs">
                {active.context.title}
              </span>
              <button
                type="button"
                aria-label={t("common.close")}
                className="app-button-ghost"
                onClick={() => setContextVisible(false)}
              >
                <X size={13} />
              </button>
            </div>
            <textarea
              aria-label={t("tasks.context")}
              readOnly
              value={active.context.text}
              className="app-input min-h-32 flex-1 font-mono text-xs"
            />
            <button
              type="button"
              className="app-button-secondary self-start text-xs"
              onClick={() =>
                void writeText(active.context?.text || "").catch((error) =>
                  setBridgeError(getErrorMessage(error, t("common.error"))),
                )
              }
            >
              <Copy size={13} />
              {t("tasks.copy")}
            </button>
          </section>
        )}
        {statusContainer
          ? visible && createPortal(statusBar, statusContainer)
          : statusBar}
      </div>
    </section>
  );
}
