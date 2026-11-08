import type { HerdrOpenedWorkspace } from "../lib/herdrControlApi";
import {
  createTerminalTab,
  type TerminalTab,
} from "../../../lib/terminalLayout";
import { removeTerminalPane } from "../../../lib/terminalPaneLayout";

function sessionFor(tab: TerminalTab, pane: string) {
  return (
    tab.paneAttachments?.[pane]?.target.session ??
    tab.herdrTarget?.session ??
    tab.herdrSession
  );
}

/** A session is rendered by one client, regardless of project workspace or entry point. */
export function findHerdrClient(tabs: TerminalTab[], session: string) {
  for (const tab of tabs) {
    const pane = [
      tab.activePane,
      ...tab.panes.filter((id) => id !== tab.activePane),
    ].find((id) => sessionFor(tab, id) === session);
    if (pane) return { tab, pane };
  }
}

/** Retain one client PTY; remove only duplicate clients, preserving unrelated shell panes. */
export function attachHerdrClient(
  tabs: TerminalTab[],
  opened: HerdrOpenedWorkspace,
  preferred?: { tab: TerminalTab; pane: string },
) {
  const session = opened.target.session;
  const existing = findHerdrClient(tabs, session) ?? preferred;
  const client =
    existing ??
    (() => {
      const tab = createTerminalTab(opened.project_id, undefined, opened.path);
      return { tab, pane: tab.activePane };
    })();
  const next = tabs.flatMap((tab) => {
    let value = tab;
    for (const pane of tab.panes) {
      if (
        sessionFor(tab, pane) !== session ||
        (tab.id === client.tab.id && pane === client.pane)
      )
        continue;
      value = removeTerminalPane(value, pane);
      const attachments = { ...value.paneAttachments };
      delete attachments[pane];
      value = { ...value, paneAttachments: attachments };
    }
    if (!value.panes.length) return [];
    if (value.id === client.tab.id) {
      value = {
        ...value,
        activePane: client.pane,
        paneAttachments: { ...value.paneAttachments, [client.pane]: opened },
      };
    }
    return [value];
  });
  if (!tabs.some((tab) => tab.id === client.tab.id)) {
    next.push({
      ...client.tab,
      herdrTarget: opened.target,
      paneAttachments: { [client.pane]: opened },
    });
  }
  return { tabs: next, tabId: client.tab.id, client };
}
