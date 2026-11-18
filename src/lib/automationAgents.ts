import type { AutomationTask, ToolInfo } from "./tauri";
import { automationAgentConfig } from "./automation";
import { herdrAgents } from "./terminalAgents";
import { orderedWorkspaceAgents } from "./workspaceAgents";

/** Map application adapter keys to the installed Herdr CLI's agent-kind vocabulary. */
const HERDR_KINDS: Record<string, string> = {
  claude_code: "claude",
  codex: "codex",
  opencode: "opencode",
  hermes: "hermes",
  gemini_cli: "gemini",
  cursor: "cursor",
  omp_agent: "omp",
  grok: "grok",
  antigravity: "agy",
  amp: "amp",
  kilo_code: "kilo",
  github_copilot: "copilot",
  droid: "droid",
  cline: "cline",
  kimi: "kimi",
  kiro: "kiro",
  pi: "pi",
  qoder: "qodercli",
  qwen_code: "qwen",
};

export function automationAgentOptions(tools: readonly ToolInfo[]) {
  return orderedWorkspaceAgents(tools).flatMap((tool) => {
    const kind = HERDR_KINDS[tool.key];
    return kind ? [{ ...tool, kind }] : [];
  });
}

export function herdrAgentKind(toolKey: string) {
  return HERDR_KINDS[toolKey];
}

export function resolveAutomationAgent(
  configuredAgent: string | undefined,
  defaultAgent: string,
) {
  if (configuredAgent !== "default") return configuredAgent ?? "";
  return HERDR_KINDS[defaultAgent] ?? defaultAgent;
}

export function automationTaskAgentKind(
  task: Pick<AutomationTask, "source" | "definition" | "agent_kind">,
) {
  if (task.source === "hermes" || task.definition?.provider === "hermes")
    return "hermes";
  return (
    task.agent_kind ??
    (task.definition
      ? automationAgentConfig(task.definition)?.agent
      : undefined)
  );
}

/** Display the configured Agent, even if its executable is not available locally. */
export function automationTaskAgent(
  task: Pick<AutomationTask, "source" | "definition" | "agent_kind">,
  tools: readonly Pick<ToolInfo, "key" | "display_name">[],
  defaultAgent: string,
  defaultLabel: string,
) {
  const configured = automationTaskAgentKind(task);
  if (!configured) return null;
  const kind = resolveAutomationAgent(configured, defaultAgent);
  if (!kind) return { label: defaultLabel };
  const preset = herdrAgents.find((agent) => agent.id === kind);
  const tool = tools.find(
    (tool) => tool.key === kind || herdrAgentKind(tool.key) === kind,
  );
  return {
    kind,
    label: preset?.label ?? tool?.display_name ?? kind,
    iconKey:
      preset?.toolKey ??
      tool?.key ??
      Object.keys(HERDR_KINDS).find((key) => herdrAgentKind(key) === kind) ??
      kind,
  };
}
