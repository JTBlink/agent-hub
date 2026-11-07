import { Channel, invoke } from "@tauri-apps/api/core";
import type { TaskProvider } from "./taskBrowserApi";
import type {
  TerminalEvent,
  TerminalSession,
  TerminalSize,
} from "./terminalApi";
export interface PlatformAccountTarget {
  context_id: string;
  provider: TaskProvider;
  host: string;
}
export interface PlatformAccountContext {
  id: string;
  provider: TaskProvider;
  host: string;
  label: string;
  project_scoped: boolean;
  remembered: boolean;
}
export interface PlatformLoginAccount {
  host: string;
  username: string;
  active: boolean;
  authenticated: boolean;
  switchable: boolean;
}
export const getPlatformAccountContexts = () =>
  invoke<PlatformAccountContext[]>("platform_account_contexts");
export const listPlatformAccounts = (
  target: PlatformAccountTarget,
  requestId: string,
) =>
  invoke<PlatformLoginAccount[]>("platform_account_list", {
    target,
    requestId,
  });
export const cancelPlatformAccountQuery = (requestId: string) =>
  invoke<void>("platform_account_cancel", { requestId });
export const switchPlatformAccount = (
  target: PlatformAccountTarget,
  username: string,
) =>
  invoke<PlatformLoginAccount[]>("platform_account_switch", {
    target,
    username,
  });
export const loginPlatformAccountToken = (
  target: PlatformAccountTarget,
  token: string,
) =>
  invoke<PlatformLoginAccount[]>("platform_account_token_login", {
    target,
    token,
  });
export const forgetPlatformAccountHost = (target: PlatformAccountTarget) =>
  invoke<void>("platform_account_forget", { target });
export function createPlatformAccountLogin(
  target: PlatformAccountTarget,
  size: TerminalSize,
  onEvent: (event: TerminalEvent) => void,
) {
  const events = new Channel<TerminalEvent>();
  events.onmessage = onEvent;
  return invoke<TerminalSession>("platform_account_login", {
    target,
    size,
    events,
  });
}
