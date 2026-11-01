import type { RepositoryTask } from "./tauri";
import type { TaskDevelopment } from "./taskBrowserApi";
export interface TerminalTaskContext {
  key: string;
  title: string;
  url: string;
  text: string;
}
export interface TerminalTaskRequest {
  projectId: string;
  context: TerminalTaskContext;
}
export function taskContext(
  task: RepositoryTask,
  body: string,
  development?: TaskDevelopment,
): TerminalTaskContext {
  const text = [
    `${task.provider === "github" ? "GitHub" : "GitLab"} · ${task.host}/${task.repository}`,
    `${task.kind === "issue" ? "Issue" : task.provider === "github" ? "PR" : "MR"} ${task.kind === "review" && task.provider === "gitlab" ? "!" : "#"}${task.number}: ${task.title}`,
    task.url,
    `State: ${task.state}`,
    ...(task.metadata?.author ? [`Author: ${task.metadata.author}`] : []),
    ...(task.assignees.length
      ? [`Assignees: ${task.assignees.join(", ")}`]
      : []),
    ...(task.metadata?.labels.length
      ? [`Labels: ${task.metadata.labels.join(", ")}`]
      : []),
    ...(task.metadata?.milestone
      ? [`Milestone: ${task.metadata.milestone}`]
      : []),
    ...(task.metadata?.review
      ? [
          `Branches: ${task.metadata.review.source_branch ?? "unknown"} -> ${task.metadata.review.target_branch ?? "unknown"}`,
          `Head: ${task.metadata.review.head_sha ?? "unknown"}`,
          `Merge status: ${task.metadata.review.merge_status ?? "unknown"}`,
        ]
      : []),
    ...(development?.checks.map(
      (check) => `Check: ${check.name} = ${check.status} ${check.url}`,
    ) ?? []),
    ...(development?.related.map(
      (link) => `Related: ${link.title} ${link.url}`,
    ) ?? []),
    ...(development?.reviews
      .slice(0, 20)
      .map(
        (review) =>
          `Review: ${review.author} = ${review.state}${review.path ? ` (${review.path}:${review.line ?? "?"})` : ""}\n${review.body.slice(0, 5000)}`,
      ) ?? []),
    "",
    body,
  ].join("\n");
  return { key: task.key, title: task.title, url: task.url, text };
}
export function terminalTaskRequest(
  value: unknown,
): TerminalTaskRequest | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("projectId" in value) ||
    typeof value.projectId !== "string" ||
    !("context" in value)
  )
    return null;
  const context = value.context;
  if (
    typeof context !== "object" ||
    context === null ||
    !("key" in context) ||
    typeof context.key !== "string" ||
    !("title" in context) ||
    typeof context.title !== "string" ||
    !("url" in context) ||
    typeof context.url !== "string" ||
    !("text" in context) ||
    typeof context.text !== "string"
  )
    return null;
  return {
    projectId: value.projectId,
    context: {
      key: context.key,
      title: context.title,
      url: context.url,
      text: context.text,
    },
  };
}
