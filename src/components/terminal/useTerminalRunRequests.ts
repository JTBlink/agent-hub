import { useDevelopmentTerminal } from "./useDevelopmentTerminal";
import {
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  createTerminalTab,
  TERMINAL_PANE_LIMIT,
  type TerminalTab,
} from "../../lib/terminalLayout";
import { isRunnableScript } from "../../lib/worktreeScripts";

export function terminalScriptRequest(state: unknown) {
  if (!state || typeof state !== "object" || !("terminalScript" in state))
    return null;
  const value = state.terminalScript;
  if (
    !value ||
    typeof value !== "object" ||
    !("projectId" in value) ||
    typeof value.projectId !== "string" ||
    !("worktreePath" in value) ||
    typeof value.worktreePath !== "string" ||
    !("scriptPath" in value) ||
    typeof value.scriptPath !== "string" ||
    !isRunnableScript(value.scriptPath)
  )
    return null;
  return {
    projectId: value.projectId,
    worktreePath: value.worktreePath,
    scriptPath: value.scriptPath,
  };
}

export function useTerminalRunRequests({
  ready,
  projectId,
  path,
  tabs,
  setTabs,
  setActiveId,
  onSelectTerminal,
  onError,
}: {
  ready: boolean;
  projectId?: string;
  path?: string;
  tabs: RefObject<TerminalTab[]>;
  setTabs: Dispatch<SetStateAction<TerminalTab[]>>;
  setActiveId: (id: string) => void;
  onSelectTerminal?: () => void;
  onError: (error: string) => void;
}) {
  useDevelopmentTerminal({
    ready,
    projectId,
    path,
    tabs,
    setTabs,
    setActiveId,
    onSelectTerminal,
  });
  const location = useLocation();
  const { t } = useTranslation();
  const consumed = useRef(location.key);
  useEffect(() => {
    const request = terminalScriptRequest(location.state);
    if (
      !ready ||
      !request ||
      consumed.current === location.key ||
      request.projectId !== projectId ||
      request.worktreePath !== path
    )
      return;
    consumed.current = location.key;
    onSelectTerminal?.();
    if (
      tabs.current.reduce((count, tab) => count + tab.panes.length, 0) >=
      TERMINAL_PANE_LIMIT
    ) {
      onError(t("worktree.terminalLimit"));
      return;
    }
    const tab = createTerminalTab(projectId, undefined, path);
    tab.scriptPath = request.scriptPath;
    tab.title = request.scriptPath.split("/").at(-1);
    setTabs((previous) => [...previous, tab]);
    setActiveId(tab.id);
    onError("");
  }, [
    ready,
    projectId,
    path,
    tabs,
    setTabs,
    setActiveId,
    onSelectTerminal,
    onError,
    location.key,
    location.state,
    t,
  ]);
}
