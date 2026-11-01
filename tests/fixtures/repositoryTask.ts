import type {
  TaskMetadata,
  TaskDevelopment,
  RepositoryTask,
} from "../../src/lib/taskBrowserApi";
export function makeTaskMetadata(
  overrides: Partial<TaskMetadata> = {},
): TaskMetadata {
  return {
    author: null,
    labels: [],
    milestone: null,
    created_at: null,
    closed_at: null,
    due_date: null,
    comment_count: null,
    task_count: null,
    completed_tasks: null,
    priority: null,
    severity: null,
    weight: null,
    issue_type: null,
    confidential: null,
    locked: null,
    estimated_seconds: null,
    spent_seconds: null,
    review: null,
    ...overrides,
  };
}
export function makeReviewMetadata(
  overrides: Partial<NonNullable<TaskMetadata["review"]>> = {},
): NonNullable<TaskMetadata["review"]> {
  return {
    source_branch: null,
    target_branch: null,
    head_sha: null,
    draft: null,
    merge_status: null,
    has_conflicts: null,
    discussions_resolved: null,
    additions: null,
    deletions: null,
    changed_files: null,
    commits: null,
    changes_count: null,
    merged_by: null,
    merged_at: null,
    reviewers: [],
    pipeline: null,
    ...overrides,
  };
}
export function makeTaskDevelopment(
  overrides: Partial<TaskDevelopment> = {},
): TaskDevelopment {
  return {
    files: [],
    commits: [],
    reviews: [],
    checks: [],
    related: [],
    approvals_required: null,
    approvals_left: null,
    warnings: [],
    truncated: [],
    ...overrides,
  };
}
export function makeRepositoryTask(
  overrides: Partial<RepositoryTask> = {},
): RepositoryTask {
  return {
    key: "demo/7",
    binding_id: "demo",
    project_id: "demo",
    provider: "gitlab",
    host: "git.example.invalid",
    repository: "team/demo",
    kind: "review",
    number: 7,
    title: "Improve parser error handling",
    state: "opened",
    updated_at: "2026-01-01T00:00:00Z",
    assignees: ["demo"],
    url: "https://git.example.invalid/team/demo/-/merge_requests/7",
    ...overrides,
  };
}
