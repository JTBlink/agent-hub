/** Native Agent choices shared by terminal launch adapters. */
export type HerdrAgent =
  "codex" | "claude" | "claude_teams" | "opencode" | "hermes";

export const herdrAgents: { id: HerdrAgent; label: string; toolKey: string }[] =
  [
    { id: "codex", label: "Codex", toolKey: "codex" },
    { id: "claude", label: "Claude Code", toolKey: "claude_code" },
    { id: "claude_teams", label: "Claude Agent Teams", toolKey: "claude_code" },
    { id: "opencode", label: "OpenCode", toolKey: "opencode" },
    { id: "hermes", label: "Hermes Agent", toolKey: "hermes" },
  ];

export const herdrAgentLabel = (agent: HerdrAgent) =>
  herdrAgents.find((item) => item.id === agent)!.label;

/** Launchable Agent kinds use the same installed-tool evidence in every entrypoint. */
export const installedTerminalAgents = (
  tools: readonly { key: string; installed: boolean }[],
) =>
  herdrAgents.filter((agent) =>
    tools.some((tool) => tool.key === agent.toolKey && tool.installed),
  );

/** Keep the launch choice and its menu icon aligned, including installed fallbacks. */
export const defaultTerminalAgent = (
  choices: ReadonlyArray<(typeof herdrAgents)[number]>,
  key: string,
) =>
  choices.find((choice) => choice.toolKey === key || choice.id === key) ??
  choices[0];
