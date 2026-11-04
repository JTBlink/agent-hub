// Prototype snapshot of the current project's complete ToolInfo catalog.
// Keep original field names. Home paths are redacted; no real settings are mutated.
import type { ToolInfo } from "../../../src/lib/tauri";
import supportedAgents from "./supported-agents.json";
export type PrototypeAgent = ToolInfo & { instruction: string };
export const initialAgents: PrototypeAgent[] = supportedAgents.map((agent) => {
  const category: ToolInfo["category"] =
    agent.category === "lobster" ? "lobster" : "coding";
  return { ...agent, category };
});
