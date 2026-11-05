/** Shared wire contracts for optional workspace integrations and saved layouts. */
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
  repository_icon?: "github" | "gitlab" | "git" | null;
  worktree?: {
    repo_key: string;
    is_linked_worktree: boolean;
    checkout_path: string;
  } | null;
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
  | "zoom"
  | "close";
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

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Navigation requests are transient; neither commands nor task prompts are restored. */
export function parseHerdrNavigation(
  state: unknown,
): HerdrOpenedWorkspace | null {
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
