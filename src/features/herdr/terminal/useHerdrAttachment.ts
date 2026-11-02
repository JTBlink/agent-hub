import {
  useEffect,
  useRef,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { herdrNavigation } from "../lib/herdrControlApi";
import {
  createTerminalTab as createTab,
  terminalScopeKey,
  TERMINAL_PANE_LIMIT,
  type TerminalTab as Tab,
} from "../../../lib/terminalLayout";

interface Options {
  ready: boolean;
  visible: boolean;
  projectId?: string;
  path?: string;
  tabs: RefObject<Tab[]>;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setActiveIds: Dispatch<SetStateAction<Record<string, string>>>;
  rememberActive: (id: string) => void;
  initializedRef: RefObject<boolean>;
  onError: (error: string) => void;
  onSelectTerminal?: () => void;
}
/** Consume each explicit attachment once and reuse the existing client for that workspace. */
export function useHerdrAttachment({
  ready,
  visible,
  projectId,
  path,
  tabs,
  setTabs,
  setActiveIds,
  rememberActive,
  initializedRef,
  onError,
  onSelectTerminal,
}: Options) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const scopeKey = terminalScopeKey(projectId, path);
  const consumedHerdr = useRef("");
  useEffect(() => {
    const request = herdrNavigation(location.state);
    if (
      !request ||
      !ready ||
      !visible ||
      consumedHerdr.current === location.key
    )
      return;
    consumedHerdr.current = location.key;
    if (request.project_id !== projectId || request.path !== path) {
      onError(t("herdr.scopeChanged"));
      return;
    }
    const existing = tabs.current.find(
      (tab) =>
        tab.projectId === request.project_id &&
        tab.worktreePath === request.path &&
        tab.herdrTarget?.session === request.target.session &&
        tab.herdrTarget.workspace_id === request.target.workspace_id,
    );
    if (
      !existing &&
      tabs.current.reduce((n, tab) => n + tab.panes.length, 0) >=
        TERMINAL_PANE_LIMIT
    ) {
      onError(t("worktree.terminalLimit"));
      return;
    }
    const tab = existing ?? {
      ...createTab(request.project_id, undefined, request.path),
      herdrTarget: request.target,
    };
    setTabs((previous) =>
      existing
        ? previous.map((item) =>
            item.id === existing.id
              ? { ...item, herdrTarget: request.target }
              : item,
          )
        : [...previous, tab],
    );
    setActiveIds((previous) => ({ ...previous, [scopeKey]: tab.id }));
    rememberActive(tab.id);
    initializedRef.current = true;
    onError("");
    onSelectTerminal?.();
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: { preserveSidebar: true },
    });
  }, [
    ready,
    visible,
    location.key,
    location.state,
    location.pathname,
    location.search,
    projectId,
    path,
    scopeKey,
    setTabs,
    setActiveIds,
    rememberActive,
    navigate,
    onSelectTerminal,
    t,
    initializedRef,
    onError,
    tabs,
  ]);
}
