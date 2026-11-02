import type { ReactNode } from "react";
import {
  CircleCheck,
  CircleDot,
  GitMerge,
  GitPullRequest,
  Github,
  Gitlab,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Project, RepositoryTask } from "../../lib/tauri";
import { cn } from "../../utils";
import { taskTime } from "../../lib/taskTime";
import { TaskSummaryFacts } from "./TaskFacts";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { TaskIssueStatus } from "./TaskIssueStatus";
import { TaskRowActions } from "./TaskRowActions";
import type { ReviewAction } from "../../lib/taskReviewActions";

export function TaskListTable({
  items,
  projects,
  selectedKey,
  empty,
  onOpen,
  onOpenRepository,
  onUpdated,
  onStart,
}: {
  items: RepositoryTask[];
  projects: Project[];
  selectedKey?: string;
  empty?: ReactNode;
  onOpen: (task: RepositoryTask, full: boolean, trigger: HTMLElement) => void;
  onOpenRepository: (task: RepositoryTask) => void;
  onUpdated: (task: RepositoryTask) => void;
  onStart: (task: RepositoryTask, action?: ReviewAction) => void;
}) {
  const { t } = useTranslation();
  return (
    <table className="w-full min-w-[720px] table-fixed text-left text-xs">
      <thead className="sticky top-0 z-10 bg-bg-secondary text-xs font-medium text-muted">
        <tr>
          <th scope="col" className="w-[100px] px-4 py-2.5">
            ID
          </th>
          <th scope="col" className="px-3 py-2.5">
            {t("tasks.titleContext")}
          </th>
          <th scope="col" className="w-[104px] px-3 py-2.5">
            {t("tasks.assignee")}
          </th>
          <th scope="col" className="w-[104px] px-3 py-2.5">
            {t("tasks.state")}
          </th>
          <th scope="col" className="w-[160px] px-3 py-2.5">
            {t("tasks.updated")}
          </th>
          <th scope="col" className="w-[144px]">
            <span className="sr-only">{t("tasks.preview")}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((task) => {
          const state = task.state.toLowerCase();
          const isOpen = state === "open" || state === "opened";
          const isMerged = state === "merged";
          const Icon = isMerged
            ? GitMerge
            : task.kind === "review"
              ? GitPullRequest
              : isOpen
                ? CircleDot
                : CircleCheck;
          const stateLabel = isOpen
            ? t("tasks.open")
            : isMerged
              ? t("tasks.merged")
              : state === "closed"
                ? t("tasks.closed")
                : task.state;
          const project = projects.find(
            (project) => project.id === task.project_id,
          );
          return (
            <tr
              key={`${task.binding_id}/${task.key}`}
              className={cn(
                "group border-t border-border-subtle transition-colors hover:bg-surface-hover",
                selectedKey === task.key && "bg-surface-active",
              )}
            >
              <td className="px-4 py-3 align-top">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle px-2 py-0.5 text-xs tabular-nums text-secondary">
                  <Icon
                    size={12}
                    aria-hidden="true"
                    className={cn(
                      isOpen
                        ? "text-[var(--color-brand-teal)]"
                        : isMerged
                          ? "text-[var(--color-brand-violet)]"
                          : "text-muted",
                    )}
                  />
                  {task.kind === "review" && task.provider === "gitlab"
                    ? "!"
                    : "#"}
                  {task.number}
                </span>
              </td>
              <td className="min-w-0 px-3 py-3">
                <button
                  type="button"
                  title={task.title}
                  className="block w-full truncate rounded text-left text-sm font-medium text-secondary outline-none hover:text-accent-light focus-visible:ring-2 focus-visible:ring-accent"
                  onClick={(event) => onOpen(task, true, event.currentTarget)}
                  onKeyDown={(event) => {
                    if (event.key === " ") {
                      event.preventDefault();
                      onOpen(task, false, event.currentTarget);
                    }
                  }}
                >
                  {task.title}
                </button>
                <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
                  {task.metadata?.author && <span>{task.metadata.author}</span>}
                  <button
                    type="button"
                    title={`${task.host}/${task.repository}`}
                    aria-label={t("tasks.openRepository", {
                      provider:
                        task.provider === "github" ? "GitHub" : "GitLab",
                      repository: task.repository,
                    })}
                    className="inline-flex min-w-0 items-center gap-1 rounded text-left outline-none hover:text-accent-light focus-visible:ring-2 focus-visible:ring-accent"
                    onClick={() => onOpenRepository(task)}
                  >
                    {task.provider === "github" ? (
                      <Github size={12} className="shrink-0" />
                    ) : (
                      <Gitlab size={12} className="shrink-0" />
                    )}
                    <span className="break-all">
                      {project?.name ? `${project.name} / ` : ""}
                      {task.repository}
                    </span>
                  </button>
                  <TaskSummaryFacts task={task} />
                </div>
              </td>
              <td
                title={task.assignees.join(", ")}
                className="break-words px-3 py-3 align-top leading-6 text-muted"
              >
                {task.assignees.join(", ") || "—"}
              </td>
              <td className="px-3 py-3 align-top leading-6">
                {task.kind === "issue" ? (
                  <TaskIssueStatus
                    task={task}
                    items={items}
                    onUpdated={onUpdated}
                  />
                ) : (
                  <TaskStatusBadge
                    state={task.state}
                    label={
                      isOpen && task.metadata?.review?.draft
                        ? t("tasks.facts.draft")
                        : stateLabel
                    }
                  />
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-3 align-top tabular-nums leading-6 text-muted">
                {taskTime(task.updated_at)}
              </td>
              <td className="px-1 py-3 align-top">
                <TaskRowActions
                  task={task}
                  canStart={!!project}
                  onStart={(action) => onStart(task, action)}
                  onPreview={(trigger) => onOpen(task, false, trigger)}
                />
              </td>
            </tr>
          );
        })}
        {!items.length && empty && (
          <tr>
            <td
              colSpan={6}
              className="px-6 py-16 text-center text-sm text-muted"
            >
              {empty}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
