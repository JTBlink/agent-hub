import {
  useEffect,
  useRef,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/tauri";
import { terminalTaskRequest } from "../../lib/taskContext";
import { getErrorMessage } from "../../lib/error";
import {
  createTerminalTab as createTab,
  terminalScopeKey,
  TERMINAL_PANE_LIMIT,
  type TerminalTab as Tab,
} from "../../lib/terminalLayout";
interface Options {
  ready: boolean;
  visible: boolean;
  projectId?: string;
  path?: string;
  projects: api.Project[];
  tabs: RefObject<Tab[]>;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setActiveIds: Dispatch<SetStateAction<Record<string, string>>>;
  initializedRef: RefObject<boolean>;
  onError: (error: string) => void;
  setProjectId: (id: string) => void;
  setContextVisible: (visible: boolean) => void;
}
/** Resolve task context before selecting or creating a terminal; never submit its text. */
export function useTerminalTaskRequest({
  ready,
  visible,
  projectId,
  path,
  projects,
  tabs,
  setTabs,
  setActiveIds,
  initializedRef,
  onError,
  setProjectId,
  setContextVisible,
}: Options) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const consumed = useRef("");
  const scopeKey = terminalScopeKey(projectId, path);
  useEffect(() => {
    const request = terminalTaskRequest(location.state);
    if (!ready || !visible || !request || consumed.current === location.key)
      return;
    let cancelled = false;
    void api
      .resolveTerminalProject(request.projectId, path)
      .then(() => {
        if (cancelled) return;
        consumed.current = location.key;
        initializedRef.current = true;
        onError("");
        const existing = tabs.current.find(
          (tab) =>
            tab.projectId === request.projectId &&
            (tab.worktreePath ??
              projects.find((project) => project.id === request.projectId)
                ?.path) ===
              (path ??
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
            tabs.current.reduce((sum, tab) => sum + tab.panes.length, 0) >=
            TERMINAL_PANE_LIMIT
          ) {
            onError(t("worktree.terminalLimit"));
            return;
          }
          const tab = createTab(
            request.projectId,
            request.context,
            path ??
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
        if (!cancelled) onError(getErrorMessage(error, t("common.error")));
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
    path,
    scopeKey,
    ready,
    projects,
    setTabs,
    setActiveIds,
    initializedRef,
    onError,
    tabs,
    setProjectId,
    setContextVisible,
  ]);
}
