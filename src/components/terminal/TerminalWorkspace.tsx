import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus, X, FileText, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import * as api from "../../lib/tauri";
import {
  terminalTaskRequest,
  type TerminalTaskContext,
} from "../../lib/taskContext";
import { getErrorMessage } from "../../lib/error";
import type { Project } from "../../lib/tauri";
import { ThemedSelect } from "../ThemedSelect";
import { TerminalPane, type PaneControl } from "./TerminalPane";
import { TerminalPanelTools } from "./TerminalPanelTools";
import { useHerdrShortcut } from "./useHerdrShortcut";
import { cn } from "../../utils";
import { projectWorkspaceRoute } from "../../lib/worktreeApi";

interface Props {
  projects: Project[];
  onMaximizedChange: (maximized: boolean) => void;
  shown?: boolean;
}
interface Tab {
  id: string;
  projectId: string;
  worktreePath?: string;
  panes: string[];
  activePane: string;
  direction: "horizontal" | "vertical";
  context?: TerminalTaskContext;
}
function createTab(
  projectId: string,
  context?: TerminalTaskContext,
  worktreePath?: string,
): Tab {
  const pane = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    projectId,
    worktreePath,
    panes: [pane],
    activePane: pane,
    direction: "horizontal",
    context,
  };
}
const toolbarAction = "app-button-ghost h-7 w-7 shrink-0 p-0";

export function TerminalWorkspace({
  projects,
  onMaximizedChange,
  shown = true,
}: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = projectWorkspaceRoute(location.pathname, location.search);
  const scopedProject = workspace?.projectId;
  const scopedPath = workspace
    ? (workspace.worktreePath ??
      projects.find((project) => project.id === scopedProject)?.path)
    : undefined;
  const legacy = location.pathname === "/terminal";
  const visible = shown && (legacy || !!workspace);
  const [projectId, setProjectId] = useState("");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const scopeKey = workspace ? JSON.stringify([scopedProject, scopedPath]) : "";
  const [activeIds, setActiveIds] = useState<Record<string, string>>({});
  const activeId = activeIds[scopeKey] ?? "";
  const setActiveId = (id: string) => {
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
    if (!visible || !request || consumed.current === location.key) return;
    let cancelled = false;
    void api
      .resolveTerminalProject(request.projectId, scopedPath)
      .then((cwd) => {
        if (cancelled) return;
        consumed.current = location.key;
        initialized.current = true;
        setBridgeError("");
        const existing = tabsRef.current.find(
          (tab) =>
            tab.projectId === request.projectId &&
            tab.worktreePath === scopedPath &&
            controls.current.get(tab.activePane)?.cwd === cwd,
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
          const tab = createTab(request.projectId, request.context, scopedPath);
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
        const tab = createTab(selected);
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
  }, [visible, legacy, selected, location.state, t, scopeKey]);
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
    scopeKey &&
    scopedProject &&
    scopedPath &&
    !terminalTaskRequest(location.state) &&
    !initializedScopes.includes(scopeKey) &&
    count < 8
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
  const herdr = useHerdrShortcut(
    () => activeTarget.current,
    `${visible}:${activeId}:${active?.activePane ?? ""}`,
  );
  const add = () => {
    if (!(scopedProject || selected) || count >= 8) return;
    initialized.current = true;
    const tab = createTab(scopedProject || selected, undefined, scopedPath);
    setTabs((previous) => [...previous, tab]);
    setActiveId(tab.id);
  };
  const split = (direction: Tab["direction"]) => {
    if (!active || active.panes.length >= 2 || count >= 8) return;
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
  const toggleMaximize = () => {
    const next = !maximized;
    setMaximized(next);
    onMaximizedChange(next);
  };
  return (
    <section
      aria-label={t("terminal.title")}
      hidden={!visible}
      className={
        visible
          ? cn(
              "relative flex min-h-0 min-w-0 flex-1 flex-col",
              legacy && "pt-[28px]",
            )
          : "hidden"
      }
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-bg-secondary px-2">
        <div
          role="tablist"
          aria-label={t("terminal.sessions")}
          className="flex min-w-0 flex-1 overflow-x-auto"
        >
          {scopedTabs.map((tab, index) => (
            <div
              key={tab.id}
              className={cn(
                "flex shrink-0 items-center rounded-t border-b-2",
                tab.id === displayedId
                  ? "border-accent bg-surface"
                  : "border-transparent",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab.id === displayedId}
                className="h-8 max-w-48 truncate px-3 text-xs"
                title={
                  projects.find((project) => project.id === tab.projectId)?.name
                }
                onClick={() => {
                  setActiveId(tab.id);
                  setProjectId(tab.projectId);
                }}
              >
                {(workspace
                  ? t("terminal.title")
                  : projects.find((project) => project.id === tab.projectId)
                      ?.name) || t("terminal.title")}{" "}
                {index + 1}
              </button>
              <button
                type="button"
                className="app-button-ghost mr-1 h-6 w-6 shrink-0 p-0"
                aria-label={t("terminal.closeTab", { number: index + 1 })}
                onClick={() => close(tab)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
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
        <button
          type="button"
          className={toolbarAction}
          aria-label={t("terminal.new")}
          title={t("terminal.new")}
          disabled={!(scopedProject || selected) || count >= 8}
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
          hasTerminal={!!active}
          herdrBusy={herdr.busy}
          hasUpdate={!!herdr.update?.has_update}
          canSplit={!!active && active.panes.length < 2 && count < 8}
          maximized={maximized}
          onHerdr={() => void herdr.launch()}
          onHerdrSidebar={() => void herdr.toggleSidebar()}
          onSplit={split}
          onMaximize={toggleMaximize}
        />
      </div>
      {!scopedTabs.length && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          {t(count >= 8 ? "worktree.terminalLimit" : "terminal.chooseProject")}
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
      <div
        role="status"
        className="flex min-h-5 shrink-0 items-center gap-2 border-t border-border-subtle px-2 text-[11px] text-muted"
      >
        <span
          className="min-w-0 flex-1 truncate"
          title={bridgeError || herdr.notice}
        >
          {bridgeError || herdr.notice}
        </span>
        {herdr.update?.has_update && (
          <button
            type="button"
            className="text-accent-light"
            disabled={herdr.busy}
            onClick={() => void herdr.upgrade()}
          >
            {t("terminal.herdrUpdateAvailable", {
              version: herdr.update.latest_version,
            })}
          </button>
        )}
      </div>
    </section>
  );
}
