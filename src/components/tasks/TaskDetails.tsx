import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Maximize2,
  TerminalSquare,
} from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as api from "../../lib/tauri";
import type { RepositoryTask, RepositoryTaskDetail } from "../../lib/tauri";
import { taskContext } from "../../lib/taskContext";
import { MarkdownContent } from "../MarkdownContent";
import { cn } from "../../utils";

interface Props {
  task: RepositoryTask;
  full: boolean;
  onClose: () => void;
  onExpand: () => void;
}
function safeLink(href: string) {
  return /^https?:\/\//i.test(href);
}
export function TaskDetails({ task, full, onClose, onExpand }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
  const context = taskContext(current, detail?.body || "");
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
          {task.repository} · #{task.number}
        </span>
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
        <h2 className="text-base font-semibold">{current.title}</h2>
        <p className="text-xs text-muted">
          {task.host} · {detail?.summary.state || task.state} ·{" "}
          {task.assignees.join(", ") || "—"}
        </p>
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
            <MarkdownContent content={detail.body} components={components} />
            <h3 className="text-xs font-medium">{t("tasks.discussion")}</h3>
            {detail.comments.map((comment) => (
              <div
                key={comment.id}
                className="border-t border-border-subtle pt-2"
              >
                <p className="mb-2 text-xs text-muted">
                  {comment.author} ·{" "}
                  {comment.updated_at
                    ? new Date(comment.updated_at).toLocaleString()
                    : ""}
                </p>
                <MarkdownContent
                  content={comment.body}
                  components={components}
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
        <button
          type="button"
          disabled={!detail}
          className="app-button-secondary text-xs"
          onClick={() => void copy()}
        >
          <Copy size={13} />
          {t("tasks.copy")}
        </button>
        <button
          type="button"
          disabled={!detail}
          className="app-button-primary text-xs"
          onClick={() =>
            navigate("/terminal", {
              state: { projectId: task.project_id, context },
            })
          }
        >
          <TerminalSquare size={13} />
          {t("tasks.openTerminal")}
        </button>
        <span role="status" className="text-xs text-muted">
          {notice}
        </span>
      </div>
    </aside>
  );
}
