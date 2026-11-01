import { invoke } from "@tauri-apps/api/core";
export type TaskProvider = "github" | "gitlab";
export type TaskKind = "issue" | "review";
export interface TaskBinding {
  id: string;
  project_id: string;
  provider: TaskProvider;
  host: string;
  repository: string;
  launcher: { program: string; args: string[] } | null;
}
export interface TaskFilters {
  kind: TaskKind;
  state: "open" | "closed" | "all";
  text: string;
  personal: "all" | "assigned" | "created";
}
export interface RepositoryTask {
  key: string;
  binding_id: string;
  project_id: string;
  provider: TaskProvider;
  host: string;
  repository: string;
  kind: TaskKind;
  number: number;
  title: string;
  state: string;
  updated_at: string;
  assignees: string[];
  url: string;
  metadata?: TaskMetadata;
}
export interface TaskCheck {
  name: string;
  status: string;
  url: string;
  sha: string | null;
}
export interface TaskMetadata {
  author: string | null;
  labels: string[];
  milestone: string | null;
  created_at: string | null;
  closed_at: string | null;
  due_date: string | null;
  comment_count: number | null;
  task_count: number | null;
  completed_tasks: number | null;
  priority: string | null;
  severity: string | null;
  weight: number | null;
  issue_type: string | null;
  confidential: boolean | null;
  locked: boolean | null;
  estimated_seconds: number | null;
  spent_seconds: number | null;
  review: {
    source_branch: string | null;
    target_branch: string | null;
    head_sha: string | null;
    draft: boolean | null;
    merge_status: string | null;
    has_conflicts: boolean | null;
    discussions_resolved: boolean | null;
    additions: number | null;
    deletions: number | null;
    changed_files: number | null;
    commits: number | null;
    changes_count: string | null;
    merged_by: string | null;
    merged_at: string | null;
    reviewers: string[];
    pipeline: TaskCheck | null;
  } | null;
}
export interface TaskDevelopment {
  files: {
    path: string;
    status: string;
    additions: number | null;
    deletions: number | null;
    patch: string | null;
  }[];
  commits: {
    sha: string;
    message: string;
    author: string;
    created_at: string | null;
    url: string;
  }[];
  reviews: {
    author: string;
    state: string;
    body: string;
    url: string;
    submitted_at: string | null;
    path: string | null;
    line: number | null;
    resolved: boolean | null;
  }[];
  checks: TaskCheck[];
  related: {
    title: string;
    url: string;
    kind: string;
    number: number | null;
  }[];
  approvals_required: number | null;
  approvals_left: number | null;
  warnings: string[];
  truncated: string[];
}
export interface RepositoryTaskPage {
  items: RepositoryTask[];
  identity: string;
  has_more: boolean;
  limited: boolean;
}
export interface RepositoryTaskComment {
  id: number;
  author: string;
  body: string;
  updated_at: string;
}
export interface RepositoryTaskDetail {
  summary: RepositoryTask;
  body: string;
  comments: RepositoryTaskComment[];
  has_more_comments: boolean;
  development?: TaskDevelopment;
}
export interface TaskFailure {
  kind: string;
  message: string;
}
export const getTaskBindings = () => invoke<TaskBinding[]>("task_bindings");
export const saveTaskBinding = (binding: TaskBinding) =>
  invoke<void>("task_save_binding", { binding });
export const removeTaskBinding = (id: string) =>
  invoke<void>("task_remove_binding", { id });
export const getTaskProjectRemotes = (projectId: string) =>
  invoke<{ remote: string; provider: TaskProvider | null }[]>(
    "task_project_remotes",
    { projectId },
  );
export const getRepositoryTasks = (
  bindingId: string,
  filters: TaskFilters,
  page: number,
  requestId: string,
) =>
  invoke<RepositoryTaskPage>("task_list", {
    bindingId,
    filters,
    page,
    requestId,
  });
export const getRepositoryTaskDetail = (
  task: RepositoryTask,
  commentsPage: number,
  requestId: string,
) =>
  invoke<RepositoryTaskDetail>("task_detail", {
    query: {
      binding_id: task.binding_id,
      kind: task.kind,
      number: task.number,
      comments_page: commentsPage,
      request_id: requestId,
    },
  });
export const cancelTaskQuery = (requestId: string) =>
  invoke<void>("task_cancel", { requestId });
export function taskFailure(error: unknown): TaskFailure {
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    typeof error.kind === "string" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return { kind: error.kind, message: error.message };
  return {
    kind: "network",
    message: error instanceof Error ? error.message : String(error),
  };
}
