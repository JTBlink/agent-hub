import type { ToolInfo } from "./tauri";

export function readAgentOrder(storageKey: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value)
      ? value.filter((key): key is string => typeof key === "string")
      : [];
  } catch {
    return [];
  }
}

/** Stored entries may include removed agents; newly detected agents append. */
export function applyAgentOrder(
  tools: ToolInfo[],
  order: string[],
): ToolInfo[] {
  const positions = new Map(order.map((key, index) => [key, index]));
  return [...tools].sort(
    (a, b) =>
      (positions.get(a.key) ?? order.length) -
      (positions.get(b.key) ?? order.length),
  );
}

/** Dragging across categories moves within the category, keeping assistants last. */
export function reorderSidebarAgents(
  tools: ToolInfo[],
  source: number,
  destination: number,
): ToolInfo[] {
  const reordered = [...tools];
  const [moved] = reordered.splice(source, 1);
  if (!moved) return tools;
  reordered.splice(destination, 0, moved);
  return [
    ...reordered.filter((tool) => tool.category === "coding"),
    ...reordered.filter((tool) => tool.category === "lobster"),
  ];
}
