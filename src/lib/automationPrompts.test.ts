import { expect, it } from "vitest";
import type { AutomationDraft } from "./tauri";
import {
  automationPrompts,
  PROMPT_VARIANTS_PATH,
  updateAutomationPrompts,
  invalidAutomationVariables,
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
    unchanged.files!.find((file) => file.path === PROMPT_VARIANTS_PATH)!
      .content,
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

it("keeps independent variables with each scenario across edits and activation", () => {
  let task = draft();
  const variants = [
    {
      id: "read",
      name: "Read",
      content: "Read",
      behavior: "read",
      variables: [{ name: "limit", value: "1" }],
    },
    {
      id: "repair",
      name: "Repair",
      content: "Repair",
      behavior: "repair",
      variables: [{ name: "limit", value: "10" }],
    },
  ];
  task = { ...task, ...updateAutomationPrompts(task, variants, "read") };
  const loaded = automationPrompts(task, "Default");
  expect(loaded.variants).toEqual(variants);
  task = {
    ...task,
    ...updateAutomationPrompts(task, loaded.variants, "repair"),
  };
  const active = automationPrompts(task, "Default");
  expect(active.activeId).toBe("repair");
  expect(active.variants[0].variables?.[0].value).toBe("1");
  expect(active.variants[1].variables?.[0].value).toBe("10");
});

it("preserves editable variable descriptions through save and reopen", () => {
  const task = draft();
  const selected = automationPrompts(task, "Default");
  selected.variants[0].variables = [
    {
      name: "repair_scope",
      value: "own",
      description: "own: current account; all: every author",
    },
  ];
  const saved = {
    ...task,
    ...updateAutomationPrompts(task, selected.variants, selected.activeId),
  };
  const reopened = automationPrompts(saved, "Default");
  expect(reopened.variants[0].variables).toEqual(
    selected.variants[0].variables,
  );
  expect(invalidAutomationVariables(reopened.variants)).toBe(false);
  reopened.variants[0].variables![0].description = "x".repeat(2001);
  expect(invalidAutomationVariables(reopened.variants)).toBe(true);
});
