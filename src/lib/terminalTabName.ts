import type { TerminalTab } from "./terminalLayout";

/** Custom names take priority over the active pane's Herdr session. */
export function terminalTabName(tab: TerminalTab): string | undefined {
  const session =
    tab.paneAttachments?.[tab.activePane]?.target.session ??
    tab.herdrTarget?.session ??
    tab.herdrSession;
  return tab.title || (session ? `herdr-${session}` : undefined);
}
