import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/tauri";
import type { Project } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/error";
import {
  readTerminalLayout,
  writeTerminalLayout,
  createTerminalTab,
  terminalScopeKey,
  TERMINAL_PANE_LIMIT,
  type TerminalLayout,
  type TerminalTab,
} from "../../lib/terminalLayout";
import { worktreeUrl } from "../../lib/worktreeApi";

/** Reconcile the previous webview's PTYs before creating any restored shells. */
export function useTerminalLayout(
  projects: Project[],
  projectsReady: boolean,
  scope: { projectId?: string; path?: string; initialize: boolean },
) {
  const { projectId, path, initialize } = scope;
  const { t } = useTranslation();
  const errorText = t("terminal.error");
  const location = useLocation();
  const navigate = useNavigate();
  const [saved] = useState(readTerminalLayout);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeIds, setActiveIds] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [lastActiveId, rememberActive] = useState(saved.lastActiveId);
  const [owner, setOwner] = useState(projectId);
  const [initializedScopes, setInitializedScopes] = useState<string[]>([]);
  // Reconcile before mounting panes, including layouts saved by older versions.
  // Removing a pane lets its existing owner dispose the emulator and PTY.
  const switching =
    ready &&
    !!projectId &&
    (owner !== projectId || tabs.some((tab) => tab.projectId !== projectId));
  if (switching) {
    const retained = tabs.filter((tab) => tab.projectId === projectId);
    const retainedIds = new Set(retained.map((tab) => tab.id));
    setOwner(projectId);
    setTabs(retained);
    setActiveIds(
      Object.fromEntries(
        Object.entries(activeIds).filter(([, id]) => retainedIds.has(id)),
      ),
    );
    if (!retainedIds.has(lastActiveId))
      rememberActive(retained.at(-1)?.id ?? "");
    if (owner !== projectId) setInitializedScopes([]);
  }
  const scopedTabs = projectId
    ? tabs.filter(
        (tab) => tab.projectId === projectId && tab.worktreePath === path,
      )
    : tabs;
  const scopeKey = terminalScopeKey(projectId, path);
  if (
    ready &&
    !switching &&
    initialize &&
    projectId &&
    path &&
    !initializedScopes.includes(scopeKey) &&
    (scopedTabs.length > 0 ||
      tabs.reduce((sum, tab) => sum + tab.panes.length, 0) <
        TERMINAL_PANE_LIMIT)
  ) {
    setInitializedScopes([...initializedScopes, scopeKey]);
    if (!scopedTabs.length) {
      const tab = createTerminalTab(projectId, undefined, path);
      setTabs([...tabs, tab]);
      setActiveIds({ ...activeIds, [scopeKey]: tab.id });
    }
  }
  const bootstrap = useRef<Promise<TerminalLayout> | null>(null);
  useEffect(() => {
    if (!projectsReady || ready) return;
    let cancelled = false;
    if (!bootstrap.current) {
      bootstrap.current = (async () => {
        const sessions = await api.listTerminals();
        const closed = await Promise.allSettled(
          sessions.map((session) => api.closeTerminal(session.id)),
        );
        const failure = closed.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") {
          const remaining = await api.listTerminals();
          if (
            remaining.some((session) =>
              sessions.some((old) => old.id === session.id),
            )
          )
            throw failure.reason;
        }
        const restored = await Promise.all(
          saved.tabs.map(async (tab) => {
            const project = projects.find(
              (project) => project.id === tab.projectId,
            );
            if (!project) return null;
            try {
              await api.resolveTerminalProject(tab.projectId, tab.worktreePath);
              return { ...tab, worktreePath: tab.worktreePath ?? project.path };
            } catch {
              return null;
            }
          }),
        );
        return { ...saved, tabs: restored.filter((tab) => tab !== null) };
      })();
    }
    void bootstrap.current
      .then((layout) => {
        if (cancelled) return;
        setTabs(layout.tabs);
        setActiveIds(layout.activeIds);
        setError("");
        setReady(true);
        const active =
          layout.tabs.find((tab) => tab.id === layout.lastActiveId) ??
          layout.tabs.at(-1);
        if (location.pathname === "/" && active) {
          navigate(worktreeUrl(active.projectId, active.worktreePath), {
            replace: true,
          });
        }
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(getErrorMessage(reason, errorText));
        const previous = saved.tabs.find(
          (tab) => tab.id === saved.lastActiveId,
        );
        if (
          location.pathname === "/" &&
          previous &&
          projects.some((project) => project.id === previous.projectId)
        ) {
          navigate(worktreeUrl(previous.projectId, previous.worktreePath), {
            replace: true,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    projects,
    projectsReady,
    ready,
    saved,
    navigate,
    location.pathname,
    attempt,
    errorText,
  ]);

  useLayoutEffect(() => {
    if (ready) writeTerminalLayout({ tabs, activeIds, lastActiveId });
  }, [tabs, activeIds, ready, lastActiveId]);

  return {
    tabs,
    scopedTabs,
    setTabs,
    activeIds,
    setActiveIds,
    ready,
    error,
    rememberActive,
    retry: () => {
      bootstrap.current = null;
      setError("");
      setAttempt((value) => value + 1);
    },
  };
}
