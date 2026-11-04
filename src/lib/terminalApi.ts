import type { DevelopmentLaunch } from "./developmentPreview";
import { Channel, invoke } from "@tauri-apps/api/core";
import { createHerdrTerminal } from "../features/herdr/terminal/api";
import type { HerdrAgent } from "../features/herdr/lib/herdrAgents";
import type { HerdrTarget } from "../features/herdr/lib/herdrControlApi";

export interface TerminalSize {
  rows: number;
  cols: number;
}
export interface TerminalSession {
  id: string;
  project_id: string;
  cwd: string;
  exited: boolean;
}
export type TerminalEvent =
  | { kind: "output"; seq: number; data: string }
  | { kind: "exit"; code: number }
  | { kind: "error"; message: string };

const closingTerminals = new Set<Promise<void>>();

export async function createTerminal(
  projectId: string,
  size: TerminalSize,
  onEvent: (event: TerminalEvent) => void,
  worktreePath?: string,
  agent?: HerdrAgent,
  herdrTarget?: HerdrTarget,
  scriptPath?: string,
  development?: DevelopmentLaunch,
) {
  // A tab can be closed and replaced before its PTY close IPC has completed.
  await Promise.all(closingTerminals);
  const events = new Channel<TerminalEvent>();
  events.onmessage = onEvent;
  if (herdrTarget)
    return createHerdrTerminal(
      projectId,
      worktreePath,
      herdrTarget,
      size,
      events,
    );
  return invoke<TerminalSession>("terminal_create", {
    projectId,
    worktreePath,
    size,
    events,
    ...(agent
      ? { launch: { kind: "agent", agent } }
      : scriptPath
        ? { launch: { kind: "script", path: scriptPath } }
        : development
          ? { launch: { kind: "development", launch: development } }
          : {}),
  });
}
export const writeTerminal = (id: string, data: string) =>
  invoke<void>("terminal_write", { id, data });
export const resizeTerminal = (id: string, size: TerminalSize) =>
  invoke<void>("terminal_resize", { id, size });
export const ackTerminal = (id: string, seq: number) =>
  invoke<void>("terminal_ack", { id, seq });
export function closeTerminal(id: string) {
  const closing = invoke<void>("terminal_close", { id });
  closingTerminals.add(closing);
  void closing.then(
    () => closingTerminals.delete(closing),
    () => closingTerminals.delete(closing),
  );
  return closing;
}
export const listTerminals = () => invoke<TerminalSession[]>("terminal_list");

export interface TerminalLaunchState {
  ready: boolean;
  revision: number;
  herdr_active: boolean;
}
export const terminalLaunchState = (id: string) =>
  invoke<TerminalLaunchState>("terminal_launch_state", { id });
export const resolveTerminalProject = (
  projectId: string,
  worktreePath?: string,
) => invoke<string>("terminal_project_directory", { projectId, worktreePath });
