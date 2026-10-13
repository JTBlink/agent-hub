import { enabledInstalledAgents } from "./agentAvailability";
import type { ToolCategory, ToolInfo } from "./tauri";

/** Global navigation lists coding agents first, followed by personal assistants. */
export function installedWorkspaceAgents(
  tools: readonly ToolInfo[],
  category?: ToolCategory,
): ToolInfo[] {
  const installed = enabledInstalledAgents(tools);
  if (category) return installed.filter((tool) => tool.category === category);
  return [
    ...installed.filter((tool) => tool.category === "coding"),
    ...installed.filter((tool) => tool.category === "lobster"),
  ];
}

export function agentWorkspacePath(tool: Pick<ToolInfo, "key" | "category">) {
  const base = tool.category === "lobster" ? "lobster" : "global";
  return `/${base}-workspace/${tool.key}`;
}
