import type { AutomationTask } from "./tauri";

export function parseAutomationOrder(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

/** Unordered tasks keep their provider order after the persisted ones. */
export function applyAutomationOrder(
  tasks: AutomationTask[],
  order: string[],
): AutomationTask[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...tasks].sort(
    (a, b) =>
      (positions.get(a.id) ?? order.length) -
      (positions.get(b.id) ?? order.length),
  );
}

/** Moves within the full list so hidden or filtered tasks keep their places. */
export function moveAutomationTask(
  tasks: AutomationTask[],
  order: string[],
  activeId: string,
  overId: string,
): string[] {
  const ids = applyAutomationOrder(tasks, order).map((task) => task.id);
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return ids;
  ids.splice(from, 1);
  ids.splice(to, 0, activeId);
  return ids;
}
