import { expect, it } from "vitest";
import {
  automationEditorResume,
  forgetAutomationEditor,
  rememberAutomationEditor,
} from "./automationEditorNavigation";
import type { AutomationEditorResume } from "./automationEditorNavigation";

it("returns the unsaved task draft only to its history entry, without storing it in shared settings", () => {
  const value: AutomationEditorResume = {
    draft: {
      name: "Unsaved",
      provider: "system",
      content: "run",
      workdir: null,
      enabled: false,
      schedule: { kind: "manual" },
    },
    restoreBackup: false,
    inactivePrompt: "unsaved prompt",
  };
  const state = { automationEditorResume: rememberAutomationEditor(value) };
  expect(JSON.stringify(state)).not.toContain("Unsaved");
  expect(
    automationEditorResume({ automationEditorResume: "other" }),
  ).toBeNull();
  expect(automationEditorResume(state)).toEqual(value);
  forgetAutomationEditor(state);
  expect(automationEditorResume(state)).toBeNull();
});
