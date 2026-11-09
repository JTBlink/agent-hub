import { expect, it } from "vitest";
import type { AutomationDraft } from "./tauri";
import {
  automationPrompts,
  PROMPT_VARIANTS_PATH,
  updateAutomationPrompts,
} from "./automationPrompts";

function draft(): AutomationDraft {
  return {
    name: "Review",
    provider: "system",
    content: "sh './scripts/run.sh'",
    workdir: null,
    enabled: false,
    schedule: { kind: "manual" },
    files: [{ path: "prompts/prompt.md", content: "Only review" }],
  };
}
it("keeps legacy content and swaps exactly one active prompt without losing edits", () => {
  let task = draft();
  const initial = automationPrompts(task, "Default");
  expect(initial.variants).toEqual([
    { id: "default", name: "Default", content: "Only review" },
  ]);
  const variants = [
    ...initial.variants,
    { id: "repair", name: "Repair", content: "Review and repair" },
  ];
  task = { ...task, ...updateAutomationPrompts(task, variants, "repair") };
  expect(task.files?.find((f) => f.path === "prompts/prompt.md")?.content).toBe(
    "Review and repair",
  );
  expect(task.content).toBe("sh './scripts/run.sh'");
  const manifest = JSON.parse(
    task.files!.find((f) => f.path === PROMPT_VARIANTS_PATH)!.content,
  );
  expect(manifest.variants[1]).toEqual({ id: "repair", name: "Repair" });
  let saved = automationPrompts(task, "Default");
  saved.variants[1].content = "Repair with tests";
  task = {
    ...task,
    ...updateAutomationPrompts(task, saved.variants, "default"),
  };
  saved = automationPrompts(task, "Default");
  expect(saved.activeId).toBe("default");
  expect(saved.variants.map((v) => v.content)).toEqual([
    "Only review",
    "Repair with tests",
  ]);
});
it("updates the Hermes execution prompt while retaining inactive variants", () => {
  const task = {
    ...draft(),
    provider: "hermes" as const,
    content: "Only review",
    files: [],
  };
  const saved = {
    ...task,
    ...updateAutomationPrompts(
      task,
      [
        { id: "review", name: "Review", content: "Only review" },
        { id: "repair", name: "Repair", content: "Repair with tests" },
      ],
      "repair",
    ),
  };
  expect(saved.content).toBe("Repair with tests");
  expect(automationPrompts(saved, "Default").variants[0].content).toBe(
    "Only review",
  );
});

it("persists an optional behavior marker without changing tasks that do not use it", () => {
  const task = draft();
  const prompts = automationPrompts(task, "Default");
  const saved = {
    ...task,
    ...updateAutomationPrompts(
      task,
      prompts.variants.map((variant) =>
        variant.id === "default" ? { ...variant, behavior: "review" } : variant,
      ),
      "default",
    ),
  };
  const manifest = JSON.parse(
    saved.files!.find((file) => file.path === PROMPT_VARIANTS_PATH)!.content,
  );
  expect(manifest.version).toBe(2);
  expect(manifest.variants[0].behavior).toBe("review");
  expect(automationPrompts(saved, "Default").variants[0].behavior).toBe(
    "review",
  );

  const unchanged = updateAutomationPrompts(task, prompts.variants, "default");
  const unchangedManifest = JSON.parse(
    unchanged.files!.find((file) => file.path === PROMPT_VARIANTS_PATH)!.content,
  );
  expect(unchangedManifest.version).toBe(1);
  expect(unchangedManifest.variants[0].behavior).toBeUndefined();
});
it.each([
  "{",
  '{"version":1,"active_id":"missing","variants":[]}',
  '{"version":1,"active_id":"a","variants":[{"id":"a","name":"A","content":"duplicate active body"}]}',
])(
  "reports malformed configurations without replacing their content (%s)",
  (content) => {
    const task = draft();
    task.files?.push({ path: PROMPT_VARIANTS_PATH, content });
    expect(automationPrompts(task, "Default").invalid).toBe(true);
    expect(task.files?.at(-1)?.content).toBe(content);
  },
);
