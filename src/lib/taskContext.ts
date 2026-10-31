import type { RepositoryTask } from "./tauri";
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
): TerminalTaskContext {
  const text = [
    `${task.provider === "github" ? "GitHub" : "GitLab"} · ${task.host}/${task.repository}`,
    `${task.kind === "issue" ? "Issue" : task.provider === "github" ? "PR" : "MR"} #${task.number}: ${task.title}`,
    task.url,
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
