import { enabledInstalledAgents } from "./agentAvailability";
import type { ToolCategory, ToolInfo } from "./tauri";
import { applyAgentOrder, readAgentOrder } from "./sidebarAgentOrder";

export const WORKSPACE_AGENT_ORDER_KEYS = {
  coding: "agent-hub:tool-order",
  lobster: "agent-hub:lobster-tool-order",
};

export function orderedWorkspaceAgents(
  tools: readonly ToolInfo[],
  codingOrder = readAgentOrder(WORKSPACE_AGENT_ORDER_KEYS.coding),
  lobsterOrder = readAgentOrder(WORKSPACE_AGENT_ORDER_KEYS.lobster),
) {
  return [
    ...applyAgentOrder(installedWorkspaceAgents(tools, "coding"), codingOrder),
    ...applyAgentOrder(
      installedWorkspaceAgents(tools, "lobster"),
      lobsterOrder,
    ),
  ];
}

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
