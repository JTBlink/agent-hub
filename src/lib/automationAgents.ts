import type { ToolInfo } from "./tauri";
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
