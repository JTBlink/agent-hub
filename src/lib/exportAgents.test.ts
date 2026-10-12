import { expect, it } from "vitest";
import { detectedProjectAgentFilters } from "./exportAgents";

it("only shows detected project agents in filters while retaining disabled installed agents", () => {
  expect(
    detectedProjectAgentFilters([
      {
        key: "claude_code",
        display_name: "Claude Code",
        installed: true,
        enabled: true,
        is_custom: false,
      },
      {
        key: "codex",
        display_name: "Codex",
        installed: true,
        enabled: false,
        is_custom: false,
      },
      {
        key: "cursor",
        display_name: "Cursor",
        installed: false,
        enabled: true,
        is_custom: false,
      },
    ]),
  ).toEqual([
    { key: "claude_code", displayName: "Claude Code" },
    { key: "codex", displayName: "Codex" },
  ]);
});
