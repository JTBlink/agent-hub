import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/tauri";
import type { Project } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/error";
import {
  readTerminalLayout,
  writeTerminalLayout,
  type TerminalLayout,
  type TerminalTab,
} from "../../lib/terminalLayout";
import { worktreeUrl } from "../../lib/worktreeApi";

/** Reconcile the previous webview's PTYs before creating any restored shells. */
export function useTerminalLayout(projects: Project[], projectsReady: boolean) {
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
