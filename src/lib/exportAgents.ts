import { enabledInstalledAgents } from "./agentAvailability";
import type { ProjectAgentTarget, ToolInfo } from "./tauri";

const PROJECT_EXPORT_AGENT_PRIORITY = [
  "claude_code",
  "codex",
  "cursor",
  "gemini_cli",
  "github_copilot",
];

/** Project addition uses personal enabled tools; adapter support remains broader. */
export function projectInstallationTargets(
  targets: ProjectAgentTarget[],
  tools: Pick<ToolInfo, "key" | "installed" | "enabled">[],
  linkedWorkspace = false,
): ProjectAgentTarget[] {
  if (linkedWorkspace) return targets;
  const enabled = new Set(
    enabledInstalledAgents(tools).map((tool) => tool.key),
  );
  return targets
    .filter((target) => enabled.has(target.key))
    .map((target) => ({ ...target, installed: true, enabled: true }));
}

export function enabledInstalledAgentKeys(
  targets: ProjectAgentTarget[],
): string[] {
  return enabledInstalledAgents(targets).map((target) => target.key);
}

export function getDefaultExportAgents(
  targets: ProjectAgentTarget[],
): string[] {
  const enabledKeys = enabledInstalledAgentKeys(targets);
  const availableKeys = new Set(enabledKeys);
  // Priority agents first, then every other enabled agent in its detected
  // order. All enabled agents are included: skillGroup export must reach each
  // one the user has installed and enabled (issue #400 — non-priority
  // agents like "pi" were silently dropped when any priority agent was on).
  const prioritized = PROJECT_EXPORT_AGENT_PRIORITY.filter((key) =>
    availableKeys.has(key),
  );
  const rest = enabledKeys.filter((key) => !prioritized.includes(key));
  return Array.from(new Set([...prioritized, ...rest]));
}

/** Project filters follow actual local detection; team installation is separate. */
export function detectedProjectAgentFilters(targets: ProjectAgentTarget[]) {
  return targets
    .filter((target) => target.installed)
    .map((target) => ({ key: target.key, displayName: target.display_name }));
}
