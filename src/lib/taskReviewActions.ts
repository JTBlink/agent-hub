import type { RepositoryTask } from "./taskBrowserApi";

export type ReviewAction = "review" | "repair" | "ci" | "merge";

export function reviewActions(task: RepositoryTask): ReviewAction[] {
  if (task.kind !== "review") return [];
  return task.state === "open" || task.state === "opened"
    ? ["review", "repair", "ci", "merge"]
    : ["review", "ci"];
}
