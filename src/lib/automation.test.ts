import { expect, it } from "vitest";
import type { AutomationDraft, AutomationScriptFile } from "./tauri";
import { automationHerdrConfig, automationPromptFile } from "./automation";

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

it("prefers canonical prompt and configuration folders over legacy entries", () => {
  const task = draft([
    { path: "prompt.md", content: "Legacy request" },
    { path: "herdr.json", content: '{"agent":"legacy"}' },
    { path: "prompts/prompt.md", content: "Current request" },
    { path: "config/herdr.json", content: '{"agent":"codex"}' },
  ]);
  expect(automationPromptFile(task)?.content).toBe("Current request");
  expect(automationHerdrConfig(task)?.agent).toBe("codex");
});

it("keeps legacy prompt and agent settings readable", () => {
  const task = draft([
    { path: "prompt.md", content: "Existing request" },
    { path: "herdr.json", content: '{"agent":"codex"}' },
  ]);
  expect(automationPromptFile(task)?.content).toBe("Existing request");
  expect(automationHerdrConfig(task)?.agent).toBe("codex");
});
