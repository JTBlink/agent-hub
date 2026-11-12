import type { AutomationDraft } from "./tauri";

export const AUTOMATION_ACTIONS_PATH = "config/actions.json";
export interface AutomationAction {
  id: string;
  name: string;
  description: string;
  script: string;
  arguments: string[];
  confirmation: string;
  preview_arguments?: string[];
}
export function automationActions(draft: AutomationDraft): {
  actions: AutomationAction[];
  invalid: boolean;
} {
  const file = draft.files?.find(
    (file) => file.path === AUTOMATION_ACTIONS_PATH,
  );
  if (!file) return { actions: [], invalid: false };
  try {
    const value: unknown = JSON.parse(file.content);
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("actions" in value) ||
      !Array.isArray(value.actions) ||
      value.actions.length > 12
    )
      throw new Error();
    const actions: AutomationAction[] = [];
    const ids = new Set<string>();
    for (const item of value.actions) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) ||
        ids.has(item.id) ||
        typeof item.name !== "string" ||
        typeof item.script !== "string" ||
        (item.description !== undefined &&
          typeof item.description !== "string") ||
        (item.confirmation !== undefined &&
          typeof item.confirmation !== "string") ||
        (item.arguments !== undefined &&
          (!Array.isArray(item.arguments) ||
            !item.arguments.every((arg: unknown) => typeof arg === "string")))
      )
        throw new Error();
      if (
        item.preview_arguments !== undefined &&
        (!Array.isArray(item.preview_arguments) ||
          !item.preview_arguments.every(
            (arg: unknown) => typeof arg === "string",
          ))
      )
        throw new Error();
      ids.add(item.id);
      actions.push({
        id: item.id,
        name: item.name,
        script: item.script,
        description: item.description ?? "",
        confirmation: item.confirmation ?? "",
        ...(item.preview_arguments !== undefined
          ? { preview_arguments: item.preview_arguments }
          : {}),
        arguments: item.arguments ?? [],
      });
    }
    return { actions, invalid: false };
  } catch {
    return { actions: [], invalid: true };
  }
}
export function withAutomationActions(
  draft: AutomationDraft,
  actions: AutomationAction[],
): Pick<AutomationDraft, "files"> {
  const files = (draft.files ?? []).filter(
    (file) => file.path !== AUTOMATION_ACTIONS_PATH,
  );
  if (actions.length)
    files.push({
      path: AUTOMATION_ACTIONS_PATH,
      content: JSON.stringify({ version: 1, actions }, null, 2),
    });
  return { files };
}
export function invalidAutomationActions(draft: AutomationDraft): boolean {
  const { actions, invalid } = automationActions(draft);
  return (
    invalid ||
    actions.some(
      (action) =>
        !action.name.trim() ||
        !draft.files?.some((file) => file.path === action.script) ||
        !/\.(sh|ps1|py)$/.test(action.script),
    )
  );
}
