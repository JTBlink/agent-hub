import type { TaskFilters } from "./taskBrowserApi";

export const defaultTaskFilters: TaskFilters = {
  kind: "issue",
  state: "open",
  text: "",
  personal: "all",
};

/** The search field is the visible source of truth for every filter. */
export function serializeTaskFilters(filters: TaskFilters): string {
  const quote = (value: string) =>
    /[\s"\\]/.test(value) ? JSON.stringify(value) : value;
  const parts = [
    filters.kind === "issue" ? "is:issue" : "is:pr",
    filters.state === "all" ? "state:all" : `is:${filters.state}`,
  ];
  const author =
    filters.author || (filters.personal === "created" ? "@me" : "");
  const assignee =
    filters.assignee || (filters.personal === "assigned" ? "@me" : "");
  if (author) parts.push(`author:${quote(author)}`);
  if (assignee) parts.push(`assignee:${quote(assignee)}`);
  for (const label of filters.labels ?? []) parts.push(`label:${quote(label)}`);
  if (filters.text.trim()) parts.push(filters.text.trim());
  return parts.join(" ");
}

function tokens(text: string): string[] {
  return text.match(/(?:[^\s"\\]|\\.|"(?:[^"\\]|\\.)*")+/g) ?? [];
}

function valueOf(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"')) return raw;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "string" ? value : raw;
  } catch {
    return raw.slice(1, -1);
  }
}

/** Resolve supported search qualifiers before querying either provider. */
export function taskSearchFilters(filters: TaskFilters): TaskFilters {
  const result = { ...filters };
  const text: string[] = [];
  let labels: string[] | undefined;
  for (const token of tokens(filters.text)) {
    const colon = token.indexOf(":");
    const key = token.slice(0, colon).toLowerCase();
    const value = valueOf(token.slice(colon + 1));
    const normalized = value.toLowerCase();
    if (colon < 1 || !value) {
      text.push(token);
    } else if (
      (key === "is" || key === "state") &&
      ["open", "closed", "merged", "draft", "all"].includes(normalized)
    ) {
      if (
        normalized === "open" ||
        normalized === "closed" ||
        normalized === "all" ||
        normalized === "merged" ||
        normalized === "draft"
      )
        result.state = normalized;
    } else if (key === "is" && normalized === "issue") {
      result.kind = "issue";
    } else if (
      key === "is" &&
      ["pr", "mr", "pull-request"].includes(normalized)
    ) {
      result.kind = "review";
    } else if (key === "author" || key === "assignee") {
      result[key] = value;
      if (
        (key === "author" && result.personal === "created") ||
        (key === "assignee" && result.personal === "assigned")
      )
        result.personal = "all";
    } else if (key === "label") {
      (labels ??= []).push(value);
    } else {
      text.push(token);
    }
  }
  if (labels) result.labels = [...new Set(labels)];
  if (result.state === "merged" || result.state === "draft")
    result.kind = "review";
  result.text = text.join(" ");
  return result;
}

/** Control changes consume qualifiers so an old query cannot override the selection. */
export function changeTaskFilters(
  filters: TaskFilters,
  patch: Partial<TaskFilters>,
): TaskFilters {
  const next = { ...taskSearchFilters(filters), ...patch };
  if (
    patch.kind === "issue" &&
    (next.state === "merged" || next.state === "draft")
  )
    next.state = "open";
  if (patch.personal && !("author" in patch) && !("assignee" in patch)) {
    next.assignee = undefined;
    next.author = undefined;
  }
  if (
    ("author" in patch || "assignee" in patch) &&
    patch.personal === undefined
  )
    next.personal = "all";
  return next;
}
