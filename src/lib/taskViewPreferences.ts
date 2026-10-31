import type { TaskFilters } from "./taskBrowserApi";
export interface TaskViewPreferences {
  provider: string;
  projectId: string;
  filters: TaskFilters;
}
const KEY = "agent-hub.taskView";
export function readTaskViewPreferences(): TaskViewPreferences {
  const defaults: TaskViewPreferences = {
    provider: "all",
    projectId: "all",
    filters: { kind: "issue", state: "open", text: "", personal: "all" },
  };
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      typeof value !== "object" ||
      value === null ||
      !("filters" in value) ||
      typeof value.filters !== "object" ||
      value.filters === null
    )
      return defaults;
    const filter = value.filters;
    return {
      provider:
        "provider" in value &&
        (value.provider === "github" || value.provider === "gitlab")
          ? value.provider
          : "all",
      projectId:
        "projectId" in value && typeof value.projectId === "string"
          ? value.projectId
          : "all",
      filters: {
        kind: "kind" in filter && filter.kind === "review" ? "review" : "issue",
        state:
          "state" in filter &&
          (filter.state === "all" || filter.state === "closed")
            ? filter.state
            : "open",
        text:
          "text" in filter && typeof filter.text === "string"
            ? filter.text.slice(0, 256)
            : "",
        personal:
          "personal" in filter &&
          (filter.personal === "created" || filter.personal === "assigned")
            ? filter.personal
            : "all",
      },
    };
  } catch {
    return defaults;
  }
}
export function saveTaskViewPreferences(preferences: TaskViewPreferences) {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    /* View preferences are optional on storage-constrained systems. */
  }
}
