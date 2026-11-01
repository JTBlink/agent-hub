import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Maximize2,
  TerminalSquare,
  RefreshCw,
} from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as api from "../../lib/tauri";
import type { RepositoryTask, RepositoryTaskDetail } from "../../lib/tauri";
import { taskContext } from "../../lib/taskContext";
import { MarkdownContent } from "../MarkdownContent";
import { cn } from "../../utils";
import { TaskFacts } from "./TaskFacts";
import { TaskDevelopmentView } from "./TaskDevelopmentView";
import { TaskCodeChanges } from "./TaskCodeChanges";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { TaskIssueStatus } from "./TaskIssueStatus";
import { TaskCommentComposer } from "./TaskCommentComposer";
import { taskTime } from "../../lib/taskTime";

interface Props {
  task: RepositoryTask;
  full: boolean;
  onClose: () => void;
  onExpand: () => void;
  onUpdated: (task: RepositoryTask) => void;
  onStart: (task: RepositoryTask) => void;
}
function safeLink(href: string) {
  return /^https?:\/\//i.test(href);
}
export function TaskDetails({
  task,
  full,
  onClose,
  onExpand,
  onUpdated,
  onStart,
}: Props) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<RepositoryTaskDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [contextVisible, setContextVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const first = useRef<HTMLButtonElement>(null);
  const loadedPage = useRef(0);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    first.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("dialog[open]")
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  useEffect(() => {
    const requestId = crypto.randomUUID();
    let disposed = false;
    void api
      .getRepositoryTaskDetail(task, page, requestId)
      .then((next) => {
        if (disposed) return;
        loadedPage.current = page;
        setDetail((previous) =>
          page > 1 && previous?.summary.key === next.summary.key
            ? {
                ...next,
                development: previous.development
                  ? {
                      ...previous.development,
                      warnings: [
                        ...new Set([
                          ...previous.development.warnings,
                          ...(next.development?.warnings ?? []),
                        ]),
                      ],
                    }
                  : next.development,
                comments: [
                  ...new Map(
                    [...previous.comments, ...next.comments].map((comment) => [
                      comment.id,
                      comment,
                    ]),
                  ).values(),
                ],
              }
            : next,
        );
      })
      .catch((reason) => {
        if (!disposed) setError(api.taskFailure(reason).message);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      void api.cancelTaskQuery(requestId).catch(() => {});
    };
  }, [task, page, retry]);
  const current = detail?.summary ?? task;
  const context = taskContext(current, detail?.body || "", detail?.development);
  const copy = async () => {
    try {
      await writeText(context.text);
      setNotice(t("tasks.copied"));
    } catch (reason) {
      setError(api.taskFailure(reason).message);
    }
  };
  const components = {
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a
        href={href && safeLink(href) ? href : undefined}
        className="text-accent-light underline"
        onClick={(event) => {
          event.preventDefault();
          if (href && safeLink(href))
            void openUrl(href).catch((reason) =>
              setError(api.taskFailure(reason).message),
            );
        }}
      >
        {children}
      </a>
    ),
    img: ({ alt }: { alt?: string }) => (
      <span className="text-muted">{alt || t("tasks.image")}</span>
    ),
  };
  return (
    <aside
      aria-label={t("tasks.details")}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface",
        full
          ? "min-w-0 flex-1"
          : "w-[420px] max-w-full shrink-0 max-[1200px]:w-full",
      )}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-border-subtle p-2">
        <button
          ref={first}
          type="button"
          className="app-button-ghost"
          aria-label={t("common.back")}
          onClick={onClose}
        >
          <ArrowLeft size={15} />
        </button>
        <span
          className="min-w-0 flex-1 truncate text-xs"
          title={`${task.host}/${task.repository}`}
        >
          {task.repository} ·{" "}
          {task.kind === "review" && task.provider === "gitlab" ? "!" : "#"}
          {task.number}
        </span>
        <button
          type="button"
          className="app-button-ghost"
          aria-label={t("tasks.copy")}
          disabled={!detail}
          onClick={() => void copy()}
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          className="app-button-ghost"
          aria-label={t("settings.refresh")}
          title={t("settings.refresh")}
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setError("");
            setPage(1);
            setRetry((value) => value + 1);
          }}
        >
          <RefreshCw size={14} />
        </button>
        {!full && (
          <button
            type="button"
            className="app-button-ghost"
            aria-label={t("tasks.fullDetails")}
            onClick={onExpand}
          >
            <Maximize2 size={14} />
          </button>
        )}
        {safeLink(task.url) && (
          <button
            type="button"
            className="app-button-ghost"
            aria-label={t("tasks.openRemote")}
            onClick={() =>
              void openUrl(task.url).catch((reason) =>
                setError(api.taskFailure(reason).message),
              )
            }
          >
            <ExternalLink size={14} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <div className="flex flex-wrap items-start gap-3">
          <h2 className="min-w-0 flex-1 break-words text-xl font-semibold">
            {current.title}{" "}
            <span className="font-normal text-muted">#{current.number}</span>
          </h2>
          <button
            type="button"
            className="app-button-primary shrink-0 text-xs"
            disabled={!detail}
            onClick={() => onStart(current)}
          >
            <TerminalSquare size={13} />
            {t("tasks.start")}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          {current.kind === "issue" ? (
            <TaskIssueStatus
              task={current}
              onUpdated={(updated) => {
                setDetail((previous) =>
                  previous ? { ...previous, summary: updated } : previous,
                );
                onUpdated(updated);
              }}
            />
          ) : (
            <TaskStatusBadge state={current.state} />
          )}
          {current.metadata?.author && (
            <span className="font-medium text-secondary">
              {current.metadata.author}
            </span>
          )}
          <span>
            {t("tasks.updated")}: {taskTime(current.updated_at)}
          </span>
        </div>
        {detail && (
          <div className="rounded-lg border border-border-subtle bg-background p-4">
            <MarkdownContent
              content={detail.body || t("tasks.noDescription")}
              components={components}
              className="max-w-none [&>:first-child]:mt-0 [&>:last-child]:mb-0"
            />
          </div>
        )}
        <details
          className="rounded border border-border-subtle px-3 py-2"
          open={current.kind === "review" || undefined}
        >
          <summary className="cursor-pointer text-xs text-muted">
            {t("tasks.factsTitle")}
          </summary>
          <div className="pt-3">
            <TaskFacts
              task={current}
              development={detail?.development}
              compact={!full}
            />
          </div>
        </details>
        {loading && (
          <p role="status" className="text-xs text-muted">
            {t("common.loading")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => {
                setLoading(true);
                setError("");
                setRetry((value) => value + 1);
              }}
            >
              {t("common.retry")}
            </button>
          </p>
        )}
        {detail && (
          <>
            <TaskDevelopmentView
              detail={detail}
              components={components}
              onOpen={(url) => {
                if (safeLink(url))
                  void openUrl(url).catch((reason) =>
                    setError(api.taskFailure(reason).message),
                  );
              }}
            />
            {current.kind === "review" && (
              <TaskCodeChanges development={detail.development} />
            )}
            <h3 className="text-sm font-medium">
              {t("tasks.discussion")}{" "}
              <span className="text-xs text-muted">
                {detail.comments.length}
                {detail.has_more_comments ? "+" : ""}
              </span>
            </h3>
            {detail.comments.map((comment) => (
              <div
                key={comment.id}
                className="overflow-hidden rounded-lg border border-border-subtle bg-background"
              >
                <p className="flex items-center gap-2 border-b border-border-subtle bg-bg-secondary px-3 py-2 text-xs text-muted">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-active font-medium text-secondary">
                    {comment.author.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="font-medium text-secondary">
                    {comment.author}
                  </span>{" "}
                  · {taskTime(comment.updated_at)}
                </p>
                <MarkdownContent
                  content={comment.body}
                  components={components}
                  className="max-w-none p-3 [&>:last-child]:mb-0"
                />
              </div>
            ))}
            {detail.has_more_comments && (
              <button
                type="button"
                disabled={loading}
                className="app-button-secondary"
                onClick={() => {
                  setLoading(true);
                  setError("");
                  setPage(loadedPage.current + 1);
                  setRetry((value) => value + 1);
                }}
              >
                {t("tasks.loadMore")}
              </button>
            )}
            <TaskCommentComposer
              task={current}
              onCreated={(comment) =>
                setDetail((previous) =>
                  previous
                    ? {
                        ...previous,
                        comments: [
                          ...previous.comments.filter(
                            (item) => item.id !== comment.id,
                          ),
                          comment,
                        ],
                      }
                    : previous,
                )
              }
            />
          </>
        )}
        {contextVisible && (
          <textarea
            readOnly
            aria-label={t("tasks.context")}
            value={context.text}
            className="app-input min-h-48 w-full font-mono text-xs"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle p-2">
        <button
          type="button"
          className="app-button-ghost text-xs"
          onClick={() => setContextVisible((value) => !value)}
        >
          {t("tasks.context")}
        </button>
        <span role="status" className="text-xs text-muted">
          {notice}
        </span>
      </div>
    </aside>
  );
}
