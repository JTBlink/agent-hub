/** Agent choices accepted by the independent Herdr launcher. */
export type HerdrAgent =
  "codex" | "claude" | "claude_teams" | "opencode" | "hermes";

export const herdrAgents: { id: HerdrAgent; label: string; icon: string }[] = [
  { id: "codex", label: "Codex", icon: "codex" },
  { id: "claude", label: "Claude", icon: "claude_code" },
  { id: "claude_teams", label: "Claude Agent Teams", icon: "claude_code" },
  { id: "opencode", label: "OpenCode", icon: "opencode" },
  { id: "hermes", label: "Hermes", icon: "hermes" },
];

export const herdrAgentLabel = (agent: HerdrAgent) =>
  herdrAgents.find((item) => item.id === agent)!.label;
