import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Plus,
  X,
  Columns2,
  Rows2,
  Maximize,
  Minimize,
  FileText,
  Copy,
} from "lucide-react";
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
import { useHerdrShortcut } from "./useHerdrShortcut";
import { cn } from "../../utils";

interface Props {
  projects: Project[];
  onMaximizedChange: (maximized: boolean) => void;
}
interface Tab {
  id: string;
  projectId: string;
  panes: string[];
  activePane: string;
  direction: "horizontal" | "vertical";
  context?: TerminalTaskContext;
}
export function TerminalWorkspace({ projects, onMaximizedChange }: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const visible = location.pathname === "/terminal";
  const [projectId, setProjectId] = useState("");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState("");
  const [maximized, setMaximized] = useState(false);
  const controls = useRef(new Map<string, PaneControl>());
  const activeTarget = useRef<PaneControl | null>(null);
  const tabsRef = useRef(tabs);
  useLayoutEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  const consumed = useRef("");
  const [bridgeError, setBridgeError] = useState("");
  const [contextVisible, setContextVisible] = useState(false);
  useEffect(() => {
    const request = terminalTaskRequest(location.state);
    if (!visible || !request || consumed.current === location.key) return;
    let cancelled = false;
    void api
      .resolveTerminalProject(request.projectId)
      .then((cwd) => {
        if (cancelled) return;
        consumed.current = location.key;
        setBridgeError("");
        const existing = tabsRef.current.find(
          (tab) =>
            tab.projectId === request.projectId &&
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
          setActiveId(existing.id);
        } else {
          const pane = crypto.randomUUID();
          const id = crypto.randomUUID();
          setTabs((previous) => [
            ...previous,
            {
              id,
              projectId: request.projectId,
              panes: [pane],
              activePane: pane,
              direction: "horizontal",
              context: request.context,
            },
          ]);
          setActiveId(id);
        }
        setProjectId(request.projectId);
        setContextVisible(false);
        navigate("/terminal", { replace: true, state: null });
      })
      .catch((error) => {
        if (!cancelled)
          setBridgeError(getErrorMessage(error, t("common.error")));
      });
    return () => {
      cancelled = true;
    };
  }, [location.key, location.state, visible, navigate, t]);
  const selected = projectId || projects[0]?.id || "";
  const active = tabs.find((tab) => tab.id === activeId);
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
  const count = tabs.reduce((sum, tab) => sum + tab.panes.length, 0);
  const add = () => {
    if (!selected || count >= 8) return;
    const pane = crypto.randomUUID();
    const tab = {
      id: crypto.randomUUID(),
      projectId: selected,
      panes: [pane],
      activePane: pane,
      direction: "horizontal" as const,
    };
    setTabs((previous) => [...previous, tab]);
    setActiveId(tab.id);
  };
  const split = (direction: Tab["direction"]) => {
    if (!active || active.panes.length >= 2 || count >= 8) return;
    const pane = crypto.randomUUID();
    setTabs((previous) =>
      previous.map((tab) =>
        tab.id === activeId
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
      if (activeId === tab.id) setActiveId(next.at(-1)?.id || "");
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
          ? "relative flex min-h-0 min-w-0 flex-1 flex-col pt-[28px]"
          : "hidden"
      }
    >
      <div className="flex min-h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        <div
          role="tablist"
          aria-label={t("terminal.sessions")}
          className="flex min-w-0 flex-1 overflow-x-auto"
        >
          {tabs.map((tab, index) => (
            <div
              key={tab.id}
              className={cn(
                "flex shrink-0 items-center rounded-t border-b-2",
                tab.id === activeId
                  ? "border-accent bg-surface"
                  : "border-transparent",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab.id === activeId}
                className="px-3 py-2 text-xs"
                onClick={() => setActiveId(tab.id)}
              >
                {projects.find((project) => project.id === tab.projectId)
                  ?.name || t("terminal.title")}{" "}
                {index + 1}
              </button>
              <button
                type="button"
                className="app-button-ghost mr-1"
                aria-label={t("terminal.closeTab", { number: index + 1 })}
                onClick={() => close(tab)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <ThemedSelect
          aria-label={t("terminal.chooseProject")}
          value={selected}
          onChange={(event) => setProjectId(event.target.value)}
          className="max-w-48 text-xs"
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
        <button
          type="button"
          className="app-button-ghost"
          aria-label={t("terminal.new")}
          title={t("terminal.new")}
          disabled={!selected || count >= 8}
          onClick={add}
        >
          <Plus size={15} />
        </button>
        {active?.context && (
          <button
            type="button"
            className="app-button-ghost"
            aria-label={t("tasks.context")}
            title={active.context.title}
            onClick={() => setContextVisible((value) => !value)}
          >
            <FileText size={15} />
          </button>
        )}
        <button
          type="button"
          className="app-button-ghost text-xs"
          disabled={!active || herdr.busy}
          onClick={() => void herdr.launch()}
          title={t("terminal.herdrLaunch")}
        >
          Herdr{herdr.update?.has_update ? " •" : ""}
        </button>
        <button
          type="button"
          className="app-button-ghost"
          aria-label={t("terminal.splitHorizontal")}
          title={t("terminal.splitHorizontal")}
          disabled={!active || active.panes.length >= 2 || count >= 8}
          onClick={() => split("horizontal")}
        >
          <Columns2 size={15} />
        </button>
        <button
          type="button"
          className="app-button-ghost"
          aria-label={t("terminal.splitVertical")}
          title={t("terminal.splitVertical")}
          disabled={!active || active.panes.length >= 2 || count >= 8}
          onClick={() => split("vertical")}
        >
          <Rows2 size={15} />
        </button>
        <button
          type="button"
          className="app-button-ghost"
          aria-label={t(maximized ? "terminal.restore" : "terminal.maximize")}
          title={t(maximized ? "terminal.restore" : "terminal.maximize")}
          onClick={toggleMaximize}
        >
          {maximized ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      </div>
      {!tabs.length && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          {t("terminal.chooseProject")}
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
          hidden={tab.id !== activeId}
          className={cn(
            tab.id === activeId ? "flex" : "hidden",
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
                active={
                  visible && activeId === tab.id && tab.activePane === pane
                }
                onReady={(control) => {
                  if (control) {
                    controls.current.set(pane, control);
                    if (
                      visible &&
                      activeId === tab.id &&
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
