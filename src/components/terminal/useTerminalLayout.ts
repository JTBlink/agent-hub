import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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

export interface TerminalStartupState {
  ready: boolean;
  error: string;
  retry: () => void;
}

/** Reconcile the previous webview's PTYs before creating any restored shells. */
export function useTerminalLayout(
  projects: Project[],
  projectsReady: boolean,
  scope: {
    projectId?: string;
    path?: string;
    initialize: boolean;
  },
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
  const [startupDestination, setStartupDestination] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [lastActiveId, rememberActive] = useState(saved.lastActiveId);
  const [initializedScopes, setInitializedScopes] = useState<string[]>([]);
  const scopeKey = terminalScopeKey(projectId, path);
  const [owner, setOwner] = useState(scopeKey);
  // Only the selected checkout owns terminals. Unmounting old panes closes
  // their PTYs; leaving for a non-workspace page keeps the current owner.
  const scopeChanged = ready && !!projectId && !!path && scopeKey !== owner;
  if (scopeChanged) {
    setOwner(scopeKey);
    setTabs([]);
    setActiveIds({});
    setInitializedScopes([]);
    rememberActive("");
  }
  const scopedTabs = projectId
    ? tabs.filter(
        (tab) => tab.projectId === projectId && tab.worktreePath === path,
      )
    : tabs;
  if (
    ready &&
    !scopeChanged &&
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
              // Reconnecting a saved Herdr client focuses its shared workspace.
              // Startup restores shells; attaching requires a fresh user action.
              const restored = {
                ...tab,
                worktreePath: tab.worktreePath ?? project.path,
              };
              delete restored.herdrTarget;
              delete restored.paneAttachments;
              return restored;
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
        const previous =
          layout.tabs.find((tab) => tab.id === layout.lastActiveId) ??
          layout.tabs.at(-1);
        // On restart, open shells only for the entry project.
        const entryProject = projectId ?? previous?.projectId;
        const entryPath = path ?? previous?.worktreePath;
        const restoredTabs = layout.tabs.filter(
          (tab) =>
            tab.projectId === entryProject && tab.worktreePath === entryPath,
        );
        setOwner(terminalScopeKey(entryProject, entryPath));
        const restoredIds = new Set(restoredTabs.map((tab) => tab.id));
        setTabs(restoredTabs);
        setActiveIds(
          Object.fromEntries(
            Object.entries(layout.activeIds).filter(([, id]) =>
              restoredIds.has(id),
            ),
          ),
        );
        setError("");
        setReady(true);
        const active =
          restoredTabs.find((tab) => tab.id === layout.lastActiveId) ??
          restoredTabs.at(-1);
        rememberActive(active?.id ?? "");
        if (location.pathname === "/" && active) {
          const destination = worktreeUrl(
            active.projectId,
            active.worktreePath,
          );
          setStartupDestination(destination);
          navigate(destination, {
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
    projectId,
    path,
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

  const retry = useCallback(() => {
    bootstrap.current = null;
    setError("");
    setAttempt((value) => value + 1);
  }, []);
  const renameTab = (tab: TerminalTab, title: string) =>
    setTabs((items) =>
      items.map((item) =>
        item.id === tab.id
          ? { ...item, title: title.trim() || undefined }
          : item,
      ),
    );
  return {
    tabs,
    scopedTabs,
    setTabs,
    renameTab,
    activeIds,
    setActiveIds,
    ready,
    startupReady:
      ready &&
      (!startupDestination ||
        `${location.pathname}${location.search}` === startupDestination),
    error,
    rememberActive,
    retry,
  };
}
