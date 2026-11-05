/** The absent integration registers no listeners, timers, background queries or IPC. */
import type { SVGProps } from "react";
import type { AutomationDraft } from "../../lib/tauri";
import type { TerminalTab } from "../../lib/terminalLayout";
import type { AgentDeliveryAdapter } from "../../lib/agentDelivery";
import type { HerdrOpenedWorkspace, HerdrTarget } from "./contracts";

export * from "./contracts";
export * from "../../lib/terminalAgents";
export const herdrEnabled = false;
export const DEFAULT_HERDR_SESSION = "default";
export const herdrDeliveryAdapter: AgentDeliveryAdapter | undefined = undefined;
export const herdrNavigation = (
  _state: unknown,
): HerdrOpenedWorkspace | null => {
  void _state;
  return null;
};
export const getHerdrInventory = async (): Promise<{
  installed: boolean;
  sessions: { name: string; running: boolean; default: boolean }[];
}> => ({ installed: false, sessions: [] });

const unavailable = async (..._args: unknown[]): Promise<never> => {
  void _args;
  throw new Error("This build does not include the Herdr integration");
};
export const createHerdrTerminal = unavailable;
export const launchTerminalHerdr = unavailable;
export const installHerdr = unavailable;
export const ensureHerdrWorkspace: (
  ...args: unknown[]
) => Promise<HerdrOpenedWorkspace> = unavailable;
export const openHerdrWorkspace: (
  ...args: unknown[]
) => Promise<HerdrOpenedWorkspace> = unavailable;
export const startHerdrAgent: (
  ...args: unknown[]
) => Promise<{ target: HerdrTarget; warning: string | null }> = unavailable;
export function useHerdrShortcut(..._args: unknown[]): {
  busy: boolean;
  notice: string;
  update: { has_update: boolean; latest_version: string } | null;
  launch: typeof unavailable;
  upgrade: typeof unavailable;
  toggleSidebar: typeof unavailable;
} {
  void _args;
  return {
    busy: false,
    notice: "",
    update: null,
    launch: unavailable,
    upgrade: unavailable,
    toggleSidebar: unavailable,
  };
}
export function useHerdrSessions(..._args: unknown[]): {
  busy: boolean;
  notice: string;
  target: HerdrTarget | undefined;
  openDefault: typeof unavailable;
  paneProps: (
    tab: TerminalTab,
    pane: string,
  ) => {
    projectId: string;
    worktreePath?: string;
    agent?: TerminalTab["agent"];
  };
} {
  void _args;
  return {
    busy: false,
    notice: "",
    target: undefined,
    openDefault: unavailable,
    paneProps: (tab: TerminalTab) => ({
      projectId: tab.projectId,
      worktreePath: tab.worktreePath,
      agent: tab.agent,
    }),
  };
}
export function useHerdrAttachment(..._args: unknown[]) {
  void _args;
}
export function SidebarHerdr(_props: { active: boolean }) {
  void _props;
  return null;
}
export function HerdrIcon(_props: SVGProps<SVGSVGElement>) {
  void _props;
  return null;
}
export function AutomationHerdrFields(_props: {
  draft: AutomationDraft;
  disabled: boolean;
  onChange: (value: Partial<AutomationDraft>) => void;
}) {
  void _props;
  return null;
}
export function HerdrTerminalTools(_props: {
  target: HerdrTarget;
  current: () => unknown;
  onError: (message: string) => void;
  onOpen: (opened: HerdrOpenedWorkspace) => void;
}) {
  void _props;
  return null;
}
