import { herdrNavigation } from "@app/herdr";
import { herdrAgents } from "../../lib/terminalAgents";
import type { TerminalTab } from "../../lib/terminalLayout";
import { workspaceStorageKey } from "../../lib/workspaceWindow";

export interface PreviewAgentBindingStore {
  read: () => TerminalTab[];
  write: (tabs: TerminalTab[]) => void;
}

/** Persist only window-scoped ownership; every explicit send revalidates the live Agent. */
export const previewAgentBindingStore: PreviewAgentBindingStore = {
  read() {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(workspaceStorageKey("agent-hub:preview-agents")) ??
          "[]",
      );
      if (!Array.isArray(stored)) return [];
      return stored.flatMap((value: unknown): TerminalTab[] => {
        if (!value || typeof value !== "object") return [];
        const record = Object.fromEntries(Object.entries(value));
        const opened = herdrNavigation({ herdrAttachment: record });
        const agent = herdrAgents.find((choice) => choice.id === record.agent);
        if (
          !opened ||
          !agent ||
          typeof record.id !== "string" ||
          typeof record.pane !== "string" ||
          typeof record.page !== "string"
        )
          return [];
        return [
          {
            id: record.id,
            projectId: opened.project_id,
            worktreePath: opened.path,
            panes: [record.pane],
            activePane: record.pane,
            direction: "horizontal",
            title: typeof record.title === "string" ? record.title : undefined,
            agent: agent.id,
            previewPageId: record.page,
            previewPending: record.pending === true,
            previewUncertain: record.uncertain === true,
            herdrTarget: opened.target,
          },
        ];
      });
    } catch {
      return [];
    }
  },
  write(tabs) {
    try {
      localStorage.setItem(
        workspaceStorageKey("agent-hub:preview-agents"),
        JSON.stringify(
          tabs.map((tab) => ({
            id: tab.id,
            project_id: tab.projectId,
            path: tab.worktreePath,
            pane: tab.panes[0],
            page: tab.previewPageId,
            title: tab.title,
            agent: tab.agent,
            pending: !!tab.previewPending,
            uncertain: !!tab.previewUncertain,
            target: tab.herdrTarget,
          })),
        ),
      );
    } catch {
      // Keep the live binding even when browser storage is unavailable.
    }
  },
};
