import {
  useEffect,
  useRef,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  herdrNavigation,
  type HerdrOpenedWorkspace,
} from "../lib/herdrControlApi";
import {
  terminalScopeKey,
  TERMINAL_PANE_LIMIT,
  type TerminalTab as Tab,
} from "../../../lib/terminalLayout";
import { attachHerdrClient, findHerdrClient } from "./herdrClientTabs";
import { terminalLaunchState } from "../api";
import type { PaneControl } from "../../../components/terminal/TerminalPane";

/** Automatic attachment may replace only a verified, untouched plain shell. */
async function reusableShell(
  tab: Tab | undefined,
  control: PaneControl | undefined,
  request: HerdrOpenedWorkspace,
  isCurrent: () => boolean,
) {
  if (
    !tab ||
    !control ||
    tab.projectId !== request.project_id ||
    tab.worktreePath !== request.path ||
    tab.panes.length !== 1 ||
    tab.agent ||
    tab.nativeAgent ||
    tab.scriptPath ||
    tab.development ||
    tab.nativeTask ||
    tab.context ||
    tab.previewPageId ||
    tab.herdrTarget ||
    tab.herdrSession ||
    tab.paneAttachments?.[tab.activePane] ||
    control.inputRevision() !== 0
  )
    return;
  try {
    const state = await terminalLaunchState(control.sessionId);
    if (
      isCurrent() &&
      state.ready &&
      !state.herdr_active &&
      control.inputRevision() === 0
    )
      return { tab, pane: tab.activePane };
  } catch {
    // Uncertain shells remain intact; only a verified idle pane is reusable.
  }
}

interface Options {
  ready: boolean;
  visible: boolean;
  projectId?: string;
  path?: string;
  tabs: RefObject<Tab[]>;
  activeId?: string;
  controls?: RefObject<Map<string, PaneControl>>;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setActiveIds: Dispatch<SetStateAction<Record<string, string>>>;
  rememberActive: (id: string) => void;
  initializedRef: RefObject<boolean>;
  onError: (error: string) => void;
  onSelectTerminal?: () => void;
}
/** Consume each explicit attachment once and reuse the session's single client. */
export function useHerdrAttachment({
  ready,
  visible,
  projectId,
  path,
  tabs,
  activeId,
  controls,
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
    if (request.project_id !== projectId || request.path !== path) {
      consumedHerdr.current = location.key;
      onError(t("herdr.scopeChanged"));
      return;
    }
    let cancelled = false;
    const attach = async () => {
      const existing = findHerdrClient(tabs.current, request.target.session);
      const shell = tabs.current.find((tab) => tab.id === activeId);
      const control = shell
        ? controls?.current.get(shell.activePane)
        : undefined;
      const preferred = existing
        ? undefined
        : await reusableShell(
            shell,
            control,
            request,
            () =>
              !cancelled &&
              !!shell &&
              controls?.current.get(shell.activePane) === control,
          );
      if (cancelled) return;
      consumedHerdr.current = location.key;
      if (
        !existing &&
        !preferred &&
        tabs.current.reduce((n, tab) => n + tab.panes.length, 0) >=
          TERMINAL_PANE_LIMIT
      ) {
        onError(t("worktree.terminalLimit"));
        return;
      }
      const client = attachHerdrClient(tabs.current, request, preferred);
      setTabs(
        (previous) => attachHerdrClient(previous, request, client.client).tabs,
      );
      setActiveIds((previous) => ({ ...previous, [scopeKey]: client.tabId }));
      rememberActive(client.tabId);
      initializedRef.current = true;
      onError(request.warning ?? "");
      onSelectTerminal?.();
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: { preserveSidebar: true },
      });
    };
    void attach();
    return () => {
      cancelled = true;
    };
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
    activeId,
    controls,
  ]);
}
