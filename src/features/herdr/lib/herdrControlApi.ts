import { invoke } from "@tauri-apps/api/core";

/** All AgentHub Herdr entry points share the native default session. */
export const DEFAULT_HERDR_SESSION = "default";

import type {
  HerdrSessionInfo,
  HerdrPane,
  HerdrSnapshot,
  HerdrTarget,
  HerdrOpenedWorkspace,
  HerdrAction,
  HerdrActionResult,
  HerdrNewAgent,
} from "../../../integrations/herdr/contracts";
export type {
  HerdrSessionInfo,
  HerdrWorkspace,
  HerdrPane,
  HerdrSnapshot,
  HerdrTarget,
  HerdrOpenedWorkspace,
  HerdrAction,
  HerdrActionResult,
  HerdrNewAgent,
} from "../../../integrations/herdr/contracts";

export const getHerdrInventory = () =>
  invoke<{ installed: boolean; sessions: HerdrSessionInfo[] }>(
    "herdr_inventory",
  );
export const getHerdrSnapshot = (session: string) =>
  invoke<HerdrSnapshot>("herdr_snapshot", { session });
export const openHerdrWorkspace = (
  session: string,
  workspaceId: string,
  paneId?: string,
) =>
  invoke<HerdrOpenedWorkspace>("herdr_open", { session, workspaceId, paneId });
export const ensureHerdrWorkspace = (
  session: string,
  projectId: string,
  worktreePath?: string,
  parentWorkspaceId?: string,
) =>
  invoke<HerdrOpenedWorkspace>("herdr_ensure", {
    session,
    projectId,
    worktreePath,
    parentWorkspaceId,
  });
export const runHerdrAction = (
  target: HerdrTarget,
  action: HerdrAction,
  text?: string,
) => invoke<HerdrActionResult>("herdr_action", { target, action, text });
export const startHerdrAgent = (target: HerdrTarget, input: HerdrNewAgent) =>
  invoke<{ target: HerdrTarget; warning: string | null }>("herdr_start_agent", {
    target,
    input,
  });
export function herdrTarget(session: string, pane: HerdrPane): HerdrTarget {
  return {
    session,
    workspace_id: pane.workspace_id,
    pane_id: pane.pane_id,
    terminal_id: pane.terminal_id,
    revision: pane.revision,
    agent_session: pane.agent_session,
  };
}

export { parseHerdrNavigation as herdrNavigation } from "../../../integrations/herdr/contracts";

export function herdrState(value: string) {
  return ["idle", "working", "blocked", "done"].includes(value)
    ? value
    : "unknown";
}

export const getHerdrSidebarKeys = () => invoke<string>("herdr_sidebar_keys");

export const deleteHerdrSession = (session: string) =>
  invoke<void>("herdr_delete_session", { session });

export const restartHerdrSession = (session: string) =>
  invoke<void>("herdr_restart_session", { session });

export const prepareHerdrSession = () =>
  invoke<string>("herdr_prepare_session");

export const deleteHerdrWorktree = (
  session: string,
  projectId: string,
  path: string,
  workspaceId?: string,
) =>
  invoke<void>("herdr_delete_worktree", {
    input: { session, projectId, path, workspaceId },
  });
