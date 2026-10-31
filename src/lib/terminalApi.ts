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

export function createTerminal(
  projectId: string,
  size: TerminalSize,
  onEvent: (event: TerminalEvent) => void,
) {
  const events = new Channel<TerminalEvent>();
  events.onmessage = onEvent;
  return invoke<TerminalSession>("terminal_create", {
    projectId,
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
export const closeTerminal = (id: string) =>
  invoke<void>("terminal_close", { id });
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
export const resolveTerminalProject = (projectId: string) =>
  invoke<string>("terminal_project_directory", { projectId });
