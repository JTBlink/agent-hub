import { workspaceStorageKey } from "./workspaceWindow";
import { readPaneLayout, type TerminalPaneLayout } from "./terminalPaneLayout";
import { parseHerdrNavigation as herdrNavigation } from "../integrations/herdr/contracts";
import type { DevelopmentTerminal } from "./developmentPreview";
import type { TerminalTaskContext } from "./taskContext";
import type { HerdrAgent } from "@app/herdr";
import {
  DEFAULT_HERDR_SESSION,
  type HerdrOpenedWorkspace,
  type HerdrTarget,
} from "@app/herdr";

export const TERMINAL_PANE_LIMIT = 8;
export const TERMINAL_LAYOUT_KEY = "agent-hub:terminal-layout";

export interface TerminalTab {
  id: string;
  projectId: string;
  worktreePath?: string;
  panes: string[];
  layout?: TerminalPaneLayout;
  activePane: string;
  direction: "horizontal" | "vertical";
  title?: string;
  herdrSession?: string;
  paneAttachments?: Record<string, HerdrOpenedWorkspace>;
  context?: TerminalTaskContext;
  // Launch intent belongs only to this run, and is omitted from saved layouts.
  agent?: HerdrAgent;
  nativeAgent?: boolean;
  scriptPath?: string;
  development?: DevelopmentTerminal;
  /** Runtime-only log visibility; hiding a service never closes its PTY. */
  developmentVisible?: boolean;
  herdrTarget?: HerdrTarget;
  /** Runtime page ownership. Never restore prompts or auto-submit after restart. */
  previewPageId?: string;
  previewPending?: boolean;
  previewUncertain?: boolean;
  nativeTask?: {
    prompt: string;
    started: () => void;
    failed: (reason: unknown) => void;
  };
}

export const isTerminalTabVisible = (tab: TerminalTab) =>
  !tab.development || !!tab.developmentVisible;

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

/** Restore layout and validated native attachment locators; never replay commands or prompts. */
export function readTerminalLayout(): TerminalLayout {
  const empty = { tabs: [], activeIds: {}, lastActiveId: "" };
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(workspaceStorageKey(TERMINAL_LAYOUT_KEY)) ?? "null",
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
        .slice(0, TERMINAL_PANE_LIMIT - count);
      if (!panes.length) continue;
      ids.add(tab.id);
      panes.forEach((pane) => ids.add(pane));
      count += panes.length;
      const attachment = herdrNavigation({
        herdrAttachment: {
          project_id: tab.projectId,
          path: tab.worktreePath,
          target: tab.herdrTarget,
        },
      });
      const paneAttachments: Record<string, HerdrOpenedWorkspace> = {};
      if (record(tab.paneAttachments)) {
        for (const pane of panes) {
          const value = herdrNavigation({
            herdrAttachment: tab.paneAttachments[pane],
          });
          if (value?.target.session === DEFAULT_HERDR_SESSION)
            paneAttachments[pane] = value;
        }
      }
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
        ...(readPaneLayout(tab.layout, panes)
          ? { layout: readPaneLayout(tab.layout, panes) }
          : {}),
        ...(typeof tab.title === "string" && tab.title.trim()
          ? { title: tab.title.trim() }
          : {}),
        ...(Object.keys(paneAttachments).length ? { paneAttachments } : {}),
        ...(attachment?.target.session === DEFAULT_HERDR_SESSION
          ? { herdrTarget: attachment.target }
          : {}),
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
    const tabs = layout.tabs.filter((tab) => !tab.development);
    const ids = new Set(tabs.map((tab) => tab.id));
    localStorage.setItem(
      workspaceStorageKey(TERMINAL_LAYOUT_KEY),
      JSON.stringify({
        version: 1,
        ...layout,
        activeIds: Object.fromEntries(
          Object.entries(layout.activeIds).filter(([, id]) => ids.has(id)),
        ),
        lastActiveId: ids.has(layout.lastActiveId)
          ? layout.lastActiveId
          : (tabs.at(-1)?.id ?? ""),
        tabs: tabs.map(
          ({
            id,
            projectId,
            worktreePath,
            panes,
            activePane,
            direction,
            layout,
            herdrTarget,
            title,
            paneAttachments,
          }) => ({
            id,
            projectId,
            worktreePath,
            panes,
            activePane,
            direction,
            ...(layout ? { layout: readPaneLayout(layout, panes) } : {}),
            ...(title?.trim() ? { title: title.trim() } : {}),
            ...(paneAttachments
              ? {
                  paneAttachments: Object.fromEntries(
                    Object.entries(paneAttachments)
                      .filter(([pane]) => panes.includes(pane))
                      .map(([pane, attachment]) => [
                        pane,
                        {
                          ...attachment,
                          target: {
                            ...attachment.target,
                            revision: 0,
                            agent_session: null,
                          },
                        },
                      ]),
                  ),
                }
              : {}),
            ...(herdrTarget
              ? {
                  herdrTarget: {
                    ...herdrTarget,
                    revision: 0,
                    agent_session: null,
                  },
                }
              : {}),
          }),
        ),
      }),
    );
  } catch {
    // Storage failure must not prevent using or closing terminals.
  }
}

/** Recover only the last explicitly attached native target, never a launch intent. */
export function lastHerdrAttachment(
  layout: TerminalLayout,
): HerdrOpenedWorkspace | null {
  const tab = layout.tabs.find((tab) => tab.id === layout.lastActiveId);
  const paneAttachment = tab?.paneAttachments?.[tab.activePane];
  if (paneAttachment) return paneAttachment;
  return tab?.herdrTarget && tab.worktreePath
    ? {
        project_id: tab.projectId,
        path: tab.worktreePath,
        target: tab.herdrTarget,
      }
    : null;
}
