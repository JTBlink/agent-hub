/** Personal Agent availability, read from detected tool state rather than project support. */
export interface AgentAvailability {
  installed: boolean;
  enabled: boolean;
}

export function isEnabledInstalledAgent(agent: AgentAvailability): boolean {
  return agent.installed && agent.enabled;
}

/** Preserve each caller's full agent records and ordering. */
export function enabledInstalledAgents<T extends AgentAvailability>(
  agents: readonly T[],
): T[] {
  return agents.filter(isEnabledInstalledAgent);
}
