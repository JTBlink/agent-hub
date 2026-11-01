import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { RepositoryTask, TaskDevelopment } from "../../lib/taskBrowserApi";
import { cn } from "../../utils";
import { TaskStatusBadge } from "./TaskStatusBadge";

export function TaskSummaryFacts({ task }: { task: RepositoryTask }) {
  const { t } = useTranslation();
  const metadata = task.metadata;
  if (!metadata) return null;
  const facts = [
    metadata.review?.draft ? t("tasks.facts.draft") : null,
    metadata.milestone,
    ...metadata.labels.slice(0, 3),
  ];
  return (
    <>
      {facts.filter(Boolean).map((fact, index) => (
        <span
          key={`${fact}:${index}`}
          title={fact ?? ""}
          className="max-w-[130px] shrink-0 truncate rounded bg-surface-hover px-1.5 py-px text-[10px] text-muted"
        >
          {fact}
        </span>
      ))}
      {metadata.comment_count != null && (
        <span className="shrink-0 text-[10px]" title={t("tasks.discussion")}>
          ◌ {metadata.comment_count}
        </span>
      )}
    </>
  );
}

export function TaskFacts({
  task,
  development,
  compact = false,
}: {
  task: RepositoryTask;
  development?: TaskDevelopment;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const m = task.metadata;
  const r = m?.review;
  if (!m) return null;
  const date = (value?: string | null) =>
    value ? new Date(value).toLocaleString() : null;
  const status = (value?: string | null) =>
    value
      ? t(`tasks.values.${value.toLowerCase()}`, { defaultValue: value })
      : null;
  const hours = (value?: number | null) =>
    value == null || value === 0 ? null : `${Math.round(value / 60)} min`;
  const facts: [string, ReactNode][] = [
    ["author", m.author],
    ["assignees", task.assignees.join(", ")],
    ["created", date(m.created_at)],
    ["updated", date(task.updated_at)],
    ["milestone", m.milestone],
    ["due", m.due_date],
    ["priority", m.priority],
    ["severity", m.severity],
    ["weight", m.weight],
    ["type", m.issue_type],
    [
      "checklist",
      m.task_count == null
        ? null
        : `${m.completed_tasks ?? "?"} / ${m.task_count}`,
    ],
    ["estimate", hours(m.estimated_seconds)],
    ["spent", hours(m.spent_seconds)],
    ["closed", date(m.closed_at)],
    ["visibility", m.confidential ? t("tasks.facts.confidential") : null],
    ["discussion", m.locked ? t("tasks.facts.locked") : null],
  ];
  const reviewFacts: [string, ReactNode][] = r
    ? [
        [
          "merge",
          r.merge_status ? (
            <TaskStatusBadge
              state={r.merge_status}
              label={status(r.merge_status) ?? undefined}
            />
          ) : null,
        ],
        [
          "conflicts",
          r.has_conflicts == null
            ? t("tasks.facts.unknown")
            : t(
                r.has_conflicts
                  ? "tasks.facts.hasConflicts"
                  : "tasks.facts.noConflicts",
              ),
        ],
        ["reviewers", r.reviewers.join(", ")],
        [
          "approvals",
          development?.approvals_left == null
            ? null
            : `${t("tasks.facts.remaining")} ${development.approvals_left}${development.approvals_required == null ? "" : ` / ${development.approvals_required}`}`,
        ],
        [
          "discussions",
          r.discussions_resolved == null
            ? null
            : t(
                r.discussions_resolved
                  ? "tasks.facts.resolved"
                  : "tasks.facts.unresolved",
              ),
        ],
        ["commits", r.commits],
        ["files", r.changed_files ?? r.changes_count],
        ["additions", r.additions == null ? null : `+${r.additions}`],
        ["deletions", r.deletions == null ? null : `−${r.deletions}`],
        [
          "head",
          r.head_sha ? (
            <code title={r.head_sha}>{r.head_sha.slice(0, 12)}</code>
          ) : null,
        ],
        ["mergedBy", r.merged_by],
        ["mergedAt", date(r.merged_at)],
      ]
    : [];
  const rows = [...reviewFacts, ...facts].filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  return (
    <div className="space-y-3">
      {m.labels.length > 0 && (
        <div
          aria-label={t("tasks.facts.labels")}
          className="flex flex-wrap gap-1"
        >
          {m.labels.map((label) => (
            <span
              key={label}
              className="rounded bg-surface-hover px-2 py-0.5 text-[11px] text-secondary"
            >
              {label}
            </span>
          ))}
        </div>
      )}
      {r && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-bg-secondary px-2 py-1 font-mono">
            {r.source_branch ?? "?"}
          </span>
          <span>→</span>
          <span className="rounded bg-bg-secondary px-2 py-1 font-mono">
            {r.target_branch ?? "?"}
          </span>
          {r.draft && (
            <span className="text-muted">{t("tasks.facts.draft")}</span>
          )}
        </div>
      )}
      <dl
        className={cn(
          "grid grid-cols-1 gap-x-6 gap-y-2 text-xs",
          !compact && "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {rows.map(([key, value]) => (
          <div key={key} className="flex min-w-0 gap-3">
            <dt className="w-24 shrink-0 text-muted">
              {t(`tasks.facts.${key}`)}
            </dt>
            <dd className="min-w-0 break-words text-secondary">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
