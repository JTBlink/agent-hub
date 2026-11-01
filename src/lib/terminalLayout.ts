import type { TerminalTaskContext } from "./taskContext";

export const TERMINAL_PANE_LIMIT = 8;
export const TERMINAL_LAYOUT_KEY = "agent-hub:terminal-layout";

export interface TerminalTab {
  id: string;
  projectId: string;
  worktreePath?: string;
  panes: string[];
  activePane: string;
  direction: "horizontal" | "vertical";
  context?: TerminalTaskContext;
}

export interface TerminalLayout {
  tabs: TerminalTab[];
  activeIds: Record<string, string>;
  lastActiveId: string;
}

export const terminalScopeKey = (projectId?: string, path?: string) =>
  projectId ? JSON.stringify([projectId, path]) : "";

export function createTerminalTab(
  projectId: string,
  context?: TerminalTaskContext,
  worktreePath?: string,
): TerminalTab {
  const pane = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    projectId,
    worktreePath,
    panes: [pane],
    activePane: pane,
    direction: "horizontal",
    context,
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Restore layout only; commands, task prompts and PTY identifiers are not saved. */
export function readTerminalLayout(): TerminalLayout {
  const empty = { tabs: [], activeIds: {}, lastActiveId: "" };
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(TERMINAL_LAYOUT_KEY) ?? "null",
    );
    if (!record(value) || value.version !== 1 || !Array.isArray(value.tabs))
      return empty;
    const tabs: TerminalTab[] = [];
    const ids = new Set<string>();
    let count = 0;
    for (const tab of value.tabs) {
      if (
        !record(tab) ||
        typeof tab.id !== "string" ||
        !tab.id ||
        ids.has(tab.id) ||
        typeof tab.projectId !== "string" ||
        !tab.projectId ||
        (tab.worktreePath !== undefined &&
          typeof tab.worktreePath !== "string") ||
        !Array.isArray(tab.panes) ||
        (tab.direction !== "horizontal" && tab.direction !== "vertical")
      )
        continue;
      const panes = tab.panes
        .filter(
          (pane): pane is string =>
            typeof pane === "string" &&
            !!pane &&
            !ids.has(pane) &&
            pane !== tab.id,
        )
        .filter((pane, index, all) => all.indexOf(pane) === index)
        .slice(0, Math.min(2, TERMINAL_PANE_LIMIT - count));
      if (!panes.length) continue;
      ids.add(tab.id);
      panes.forEach((pane) => ids.add(pane));
      count += panes.length;
      tabs.push({
        id: tab.id,
        projectId: tab.projectId,
        worktreePath: tab.worktreePath,
        panes,
        activePane:
          typeof tab.activePane === "string" && panes.includes(tab.activePane)
            ? tab.activePane
            : panes[0],
        direction: tab.direction,
      });
    }
    const activeIds: Record<string, string> = {};
    if (record(value.activeIds)) {
      for (const [scope, id] of Object.entries(value.activeIds)) {
        if (
          typeof id === "string" &&
          tabs.some(
            (tab) =>
              tab.id === id &&
              (scope === "" ||
                scope === terminalScopeKey(tab.projectId, tab.worktreePath)),
          )
        ) {
          activeIds[scope] = id;
        }
      }
    }
    return {
      tabs,
      activeIds,
      lastActiveId:
        typeof value.lastActiveId === "string" &&
        tabs.some((tab) => tab.id === value.lastActiveId)
          ? value.lastActiveId
          : (tabs.at(-1)?.id ?? ""),
    };
  } catch {
    return empty;
  }
}

export function writeTerminalLayout(layout: TerminalLayout) {
  try {
    localStorage.setItem(
      TERMINAL_LAYOUT_KEY,
      JSON.stringify({
        version: 1,
        ...layout,
        tabs: layout.tabs.map(
          ({ id, projectId, worktreePath, panes, activePane, direction }) => ({
            id,
            projectId,
            worktreePath,
            panes,
            activePane,
            direction,
          }),
        ),
      }),
    );
  } catch {
    // Storage failure must not prevent using or closing terminals.
  }
}
