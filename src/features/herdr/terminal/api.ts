import { invoke, type Channel } from "@tauri-apps/api/core";
import type {
  TerminalEvent,
  TerminalSession,
  TerminalSize,
} from "../../../lib/terminalApi";
import type { HerdrTarget } from "../lib/herdrControlApi";

/** Create the PTY client only after the Herdr module has verified its target. */
export const createHerdrTerminal = (
  projectId: string,
  worktreePath: string | undefined,
  target: HerdrTarget,
  size: TerminalSize,
  events: Channel<TerminalEvent>,
) =>
  invoke<TerminalSession>("herdr_terminal_create", {
    request: {
      project_id: projectId,
      worktree_path: worktreePath ?? "",
      target,
      size,
    },
    events,
  });

export const launchTerminalHerdr = (id: string, revision: number) =>
  invoke<boolean>("terminal_launch_herdr", { id, revision });
