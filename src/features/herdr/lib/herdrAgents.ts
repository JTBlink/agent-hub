/** Agent choices accepted by the independent Herdr launcher. */
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
