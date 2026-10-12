import type { ProjectAgentTarget } from "./tauri";

const PROJECT_EXPORT_AGENT_PRIORITY = [
  "claude_code",
  "codex",
  "cursor",
  "gemini_cli",
  "github_copilot",
];

// Initial personal suggestion only. Team installation can explicitly select
// any project adapter, including tools not installed on this computer.
export function enabledInstalledAgentKeys(
  targets: ProjectAgentTarget[],
): string[] {
  return targets
    .filter((target) => target.installed && target.enabled)
    .map((target) => target.key);
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
  return enabledKeys.length > 0
    ? Array.from(new Set([...prioritized, ...rest]))
    : targets
        .filter((target) => target.key === "claude_code")
        .map((target) => target.key);
}

/** Project filters follow actual local detection; team installation is separate. */
export function detectedProjectAgentFilters(targets: ProjectAgentTarget[]) {
  return targets
    .filter((target) => target.installed)
    .map((target) => ({ key: target.key, displayName: target.display_name }));
}
