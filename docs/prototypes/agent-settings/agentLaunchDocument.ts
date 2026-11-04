// Portable launch configuration only; original ToolInfo fields retain their own source.
import { initialAgents, type PrototypeAgent } from "./agentData";
export type LaunchDocument = {
  schema_version: 1;
  default_agent: string;
  instructions: Record<string, string>;
};
export function launchDocument(
  agents: PrototypeAgent[],
  defaultAgent: string,
): LaunchDocument {
  const instructions: Record<string, string> = {};
  for (const agent of [...agents].sort((a, b) => a.key.localeCompare(b.key))) {
    const baseline = initialAgents.find((item) => item.key === agent.key);
    if (!baseline || agent.instruction !== baseline.instruction)
      instructions[agent.key] = agent.instruction;
  }
  return { schema_version: 1, default_agent: defaultAgent, instructions };
}
export function instructionFor(document: LaunchDocument, key: string) {
  return (
    document.instructions[key] ??
    initialAgents.find((agent) => agent.key === key)?.instruction ??
    ""
  );
}

export function serializeLaunchDocument(document: LaunchDocument) {
  return JSON.stringify({
    ...document,
    instructions: Object.fromEntries(
      Object.entries(document.instructions).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    ),
  });
}
