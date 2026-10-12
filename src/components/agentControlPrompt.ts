import {
  enabledInstalledAgents,
  isEnabledInstalledAgent,
} from "../lib/agentAvailability";
import type {
  AgentControlAgentLocation,
  AgentControlStatus,
} from "../lib/tauri";

/** Whether the user chose to hide the one-time setup prompt. */
export function isAgentControlPromptDismissed(value: string | null): boolean {
  return value === "dismissed";
}

export type AgentControlMode =
  "install" | "deploy" | "update" | "attention" | null;

export function agentControlMode(
  status: AgentControlStatus,
  dismissed: boolean,
): AgentControlMode {
  const agents = enabledInstalledAgents(status.agents);
  if (status.library.occupied && !status.library.present) return "attention";
  if (status.library.present && !status.library_skill_id) return "attention";
  if (!status.library.present) return dismissed ? null : "install";
  if (agents.some((agent) => agent.occupied && !agent.present)) {
    return "attention";
  }
  if (
    status.library.outdated ||
    status.library_update_available ||
    agents.some((agent) => agent.present && agent.outdated && agent.managed)
  ) {
    return "update";
  }
  if (
    agents.some((agent) => agent.present && agent.outdated && !agent.managed)
  ) {
    return "attention";
  }
  if (agents.some((agent) => !agent.occupied)) {
    return dismissed ? null : "deploy";
  }
  return null;
}

export function agentControlCandidates(
  status: AgentControlStatus,
): AgentControlAgentLocation[] {
  return status.agents.filter(
    (agent) =>
      isEnabledInstalledAgent(agent) &&
      (!agent.occupied || (agent.present && agent.outdated && agent.managed)),
  );
}
