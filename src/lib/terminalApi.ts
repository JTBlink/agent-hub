import { Channel, invoke } from "@tauri-apps/api/core";

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
) {
  // A tab can be closed and replaced before its PTY close IPC has completed.
  await Promise.all(closingTerminals);
  const events = new Channel<TerminalEvent>();
  events.onmessage = onEvent;
  return invoke<TerminalSession>("terminal_create", {
    projectId,
    worktreePath,
    size,
    events,
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

export interface HerdrInstallation {
  path: string;
  version: string;
  managed: boolean;
}
export interface HerdrUpdate {
  latest_version: string;
  has_update: boolean;
  managed: boolean;
}
export interface TerminalLaunchState {
  ready: boolean;
  revision: number;
  herdr_active: boolean;
}
export const detectHerdr = () =>
  invoke<HerdrInstallation | null>("herdr_detect");
export const installHerdr = () => invoke<HerdrInstallation>("herdr_install");
export const checkHerdrUpdate = () => invoke<HerdrUpdate>("herdr_check_update");
export const updateHerdr = () => invoke<HerdrInstallation>("herdr_update");
export const terminalLaunchState = (id: string) =>
  invoke<TerminalLaunchState>("terminal_launch_state", { id });
export const launchTerminalHerdr = (id: string, revision: number) =>
  invoke<boolean>("terminal_launch_herdr", { id, revision });
export const resolveTerminalProject = (
  projectId: string,
  worktreePath?: string,
) => invoke<string>("terminal_project_directory", { projectId, worktreePath });
