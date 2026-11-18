import type { AutomationDraft, AutomationTask } from "./tauri";

export interface AutomationEditorResume {
  draft: AutomationDraft;
  task?: AutomationTask;
  restoreBackup: boolean;
  inactivePrompt: string;
}

// One temporary return draft, kept in memory rather than in browser history,
// disk, user configuration, backup or sync. Read it only at the originating entry.
let pending: { id: string; value: AutomationEditorResume } | null = null;

export function rememberAutomationEditor(
  value: AutomationEditorResume,
): string {
  const id = crypto.randomUUID();
  pending = { id, value };
  return id;
}

export function automationEditorResume(
  state: unknown,
): AutomationEditorResume | null {
  if (
    !state ||
    typeof state !== "object" ||
    !("automationEditorResume" in state)
  )
    return null;
  return pending && pending.id === state.automationEditorResume
    ? pending.value
    : null;
}

export function forgetAutomationEditor(state: unknown): void {
  if (automationEditorResume(state)) pending = null;
}
