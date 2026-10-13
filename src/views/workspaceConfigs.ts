import type { ToolCategory } from "../lib/tauri";

/**
 * Drives a single category of the workspace (coding agents or lobster agents).
 * Per-agent UX is shared across categories. The global overview covers all agents;
 * the legacy personal-assistant overview and detail routes remain category-scoped.
 */
export interface WorkspaceConfig {
  category: ToolCategory;
  basePath: string;
  /** The global overview includes both categories; detail routes keep their category. */
  allAgentsOverview?: boolean;
  i18nKeys: {
    /** Heading shown on the "all agents" overview page. */
    title: string;
    /** Heading shown when no agents in this category are installed. */
    noAgents: string;
    /** Hint shown under the no-agents heading. */
    noAgentsHint: string;
  };
}

export const CODING_WORKSPACE_CONFIG: WorkspaceConfig = {
  category: "coding",
  basePath: "/global-workspace",
  allAgentsOverview: true,
  i18nKeys: {
    title: "globalWorkspace.title",
    noAgents: "globalWorkspace.noAgents",
    noAgentsHint: "globalWorkspace.noAgentsHint",
  },
};

export const LOBSTER_WORKSPACE_CONFIG: WorkspaceConfig = {
  category: "lobster",
  basePath: "/lobster-workspace",
  i18nKeys: {
    title: "lobsterWorkspace.title",
    noAgents: "lobsterWorkspace.noAgents",
    noAgentsHint: "lobsterWorkspace.noAgentsHint",
  },
};
