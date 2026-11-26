import { terminalHerdrSession, type TerminalTab } from "./terminalLayout";

/** Custom names take priority over the active pane's Herdr session. */
export function terminalTabName(tab: TerminalTab): string | undefined {
  const session = terminalHerdrSession(tab, tab.activePane);
  return tab.title || (session ? `herdr-${session}` : undefined);
}
