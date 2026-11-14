import { expect, it } from "vitest";
import type { AutomationDraft, AutomationScriptFile } from "./tauri";
import { automationAgentConfig, automationPromptFile } from "./automation";
import { resolveAutomationAgent } from "./automationAgents";

function draft(files: AutomationScriptFile[]): AutomationDraft {
  return {
    name: "Review",
    provider: "system",
    content: "sh './scripts/run.sh'",
    workdir: null,
    script_dir: null,
    enabled: false,
    schedule: { kind: "manual" },
    files,
  };
}

it("reads the canonical Agent configuration", () => {
  const task = draft([
    { path: "prompt.md", content: "Unused request" },
    { path: "prompts/prompt.md", content: "Current request" },
    {
      path: "config/agent.json",
      content: JSON.stringify({
        runner: { kind: "codex", session: "default", title: "Review" },
        launch: { arguments: [] },
        execution: { wait_timeout_seconds: 1800 },
      }),
    },
  ]);
  expect(automationPromptFile(task)?.content).toBe("Current request");
  expect(automationAgentConfig(task)?.agent).toBe("codex");
});

it("accepts session reuse only as whole seconds up to one day", () => {
  const withReuse = (value: unknown) =>
    draft([
      { path: "prompts/prompt.md", content: "Current request" },
      {
        path: "config/agent.json",
        content: JSON.stringify({
          runner: { kind: "codex", session: "default", title: "Review" },
          launch: { arguments: [] },
          execution: {
            wait_timeout_seconds: 1800,
            session_reuse_seconds: value,
          },
        }),
      },
    ]);
  for (const value of [0, 21600, 86400])
    expect(
      automationAgentConfig(withReuse(value))?.value.execution
        .session_reuse_seconds,
    ).toBe(value);
  for (const value of [-1, 86401, 1.5, "21600", true])
    expect(automationAgentConfig(withReuse(value))).toBeNull();
});

it("resolves the legacy default runner to the configured Agent kind", () => {
  expect(resolveAutomationAgent("default", "claude_code")).toBe("claude");
  expect(resolveAutomationAgent("default", "custom-agent")).toBe(
    "custom-agent",
  );
  expect(resolveAutomationAgent("codex", "claude_code")).toBe("codex");
});
