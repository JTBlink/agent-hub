import { invoke } from "@tauri-apps/api/core";

export interface HerdrSessionInfo {
  name: string;
  running: boolean;
  default: boolean;
}
export interface HerdrWorkspace {
  workspace_id: string;
  label: string;
  active_tab_id: string;
  directory: string | null;
  branch: string | null;
}
export interface HerdrPane {
  pane_id: string;
  workspace_id: string;
  tab_id: string;
  terminal_id: string;
  cwd: string | null;
  focused: boolean;
  revision: number;
  agent_status: string;
  agent: string | null;
  name: string | null;
  agent_session: unknown;
}
export interface HerdrSnapshot {
  version: string;
  workspaces: HerdrWorkspace[];
  tabs: { tab_id: string; workspace_id: string; label: string }[];
  panes: HerdrPane[];
  agents: HerdrPane[];
  layouts?: { tab_id: string; zoomed: boolean }[];
}
export interface HerdrTarget {
  session: string;
  workspace_id: string;
  pane_id: string;
  terminal_id: string;
  revision: number;
  agent_session: unknown;
}
export interface HerdrOpenedWorkspace {
  project_id: string;
  path: string;
  target: HerdrTarget;
}
export type HerdrAction =
  | "read"
  | "prompt"
  | "interrupt"
  | "new_tab"
  | "split_right"
  | "split_down"
  | "zoom";
export interface HerdrActionResult {
  output: string | null;
  target: HerdrTarget | null;
}
export interface HerdrNewAgent {
  kind: string;
  name: string;
  direction: "right" | "down";
  prompt: string;
}
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
) =>
  invoke<HerdrOpenedWorkspace>("herdr_ensure", {
    session,
    projectId,
    worktreePath,
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

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Navigation requests are transient; neither commands nor task prompts are restored. */
export function herdrNavigation(state: unknown): HerdrOpenedWorkspace | null {
  if (!record(state) || !record(state.herdrAttachment)) return null;
  const value = state.herdrAttachment;
  if (
    typeof value.project_id !== "string" ||
    typeof value.path !== "string" ||
    !record(value.target)
  )
    return null;
  const p = value.target;
  if (
    typeof p.session !== "string" ||
    typeof p.workspace_id !== "string" ||
    typeof p.pane_id !== "string" ||
    typeof p.terminal_id !== "string" ||
    typeof p.revision !== "number"
  )
    return null;
  return {
    project_id: value.project_id,
    path: value.path,
    target: {
      session: p.session,
      workspace_id: p.workspace_id,
      pane_id: p.pane_id,
      terminal_id: p.terminal_id,
      revision: p.revision,
      agent_session: p.agent_session,
    },
  };
}

export function herdrState(value: string) {
  return ["idle", "working", "blocked", "done"].includes(value)
    ? value
    : "unknown";
}

export const getHerdrSidebarKeys = () => invoke<string>("herdr_sidebar_keys");
