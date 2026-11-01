import { useRef, useState } from "react";
import { Bold, Italic, List, Quote, Code, Link, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  addRepositoryTaskComment,
  taskFailure,
  type RepositoryTask,
  type RepositoryTaskComment,
} from "../../lib/taskBrowserApi";

export function TaskCommentComposer({
  task,
  onCreated,
}: {
  task: RepositoryTask;
  onCreated: (comment: RepositoryTaskComment) => void;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const pending = useRef(false);
  const format = (prefix: string, suffix = "") => {
    const field = input.current;
    if (!field) return;
    const start = field.selectionStart,
      end = field.selectionEnd;
    setBody(
      `${body.slice(0, start)}${prefix}${body.slice(start, end)}${suffix}${body.slice(end)}`,
    );
    field.focus();
    requestAnimationFrame(() =>
      field.setSelectionRange(start + prefix.length, end + prefix.length),
    );
  };
  const submit = async () => {
    if (pending.current || !body.trim()) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const comment = await addRepositoryTaskComment(task, body);
      onCreated(comment);
      setBody("");
    } catch (error) {
      setError(`${taskFailure(error).message} ${t("tasks.commentRetryHint")}`);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <form
      className="overflow-hidden rounded border border-border-subtle bg-background"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div
        className="flex items-center gap-1 border-b border-border-subtle p-1"
        role="toolbar"
        aria-label={t("tasks.commentFormatting")}
      >
        {[
          { key: "bold", icon: Bold, prefix: "**", suffix: "**" },
          { key: "italic", icon: Italic, prefix: "_", suffix: "_" },
          { key: "list", icon: List, prefix: "\n- ", suffix: "" },
          { key: "quote", icon: Quote, prefix: "\n> ", suffix: "" },
          { key: "code", icon: Code, prefix: "`", suffix: "`" },
          { key: "link", icon: Link, prefix: "[", suffix: "](https://)" },
        ].map(({ key, icon: Icon, prefix, suffix }) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            className="app-button-ghost h-7 w-7 p-0"
            aria-label={t(`tasks.format.${key}`)}
            title={t(`tasks.format.${key}`)}
            onClick={() => format(prefix, suffix)}
          >
            <Icon size={13} />
          </button>
        ))}
        <span className="ml-auto px-2 text-xs text-muted">Markdown</span>
      </div>
      <textarea
        ref={input}
        aria-label={t("tasks.addComment")}
        placeholder={t("tasks.addComment")}
        className="app-input min-h-32 w-full resize-y border-0 bg-transparent text-sm"
        disabled={busy}
        maxLength={65536}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex items-center gap-2 p-2">
        {error && (
          <p role="alert" className="min-w-0 text-xs text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="app-button-primary ml-auto shrink-0 text-xs"
        >
          <Send size={13} />
          {busy ? t("common.loading") : t("tasks.sendComment")}
        </button>
      </div>
    </form>
  );
}
