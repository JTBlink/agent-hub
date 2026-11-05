import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CodeEditor } from "../../../components/file-reader/CodeEditor";
import { getErrorMessage } from "../../../lib/error";
import { previewApi } from "../api";

/** A read-only snapshot of the loaded page DOM; never a local editable document. */
export function WebPageSource({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    pageId: string;
    attempt: number;
    content?: string;
    error?: string;
  }>();
  const current =
    result?.pageId === pageId && result.attempt === attempt
      ? result
      : undefined;
  const content = current?.content;
  const error = current?.error;
  useEffect(() => {
    let disposed = false;
    void previewApi
      .action<unknown>(pageId, {
        kind: "evaluate",
        expression:
          "(document.doctype ? new XMLSerializer().serializeToString(document.doctype) + '\\n' : '') + (document.documentElement?.outerHTML ?? '')",
      })
      .then((value) => {
        if (typeof value !== "string") throw new Error(t("common.error"));
        if (!disposed) setResult({ pageId, attempt, content: value });
      })
      .catch((cause: unknown) => {
        if (!disposed)
          setResult({
            pageId,
            attempt,
            error: getErrorMessage(cause, t("common.error")),
          });
      });
    return () => {
      disposed = true;
    };
  }, [pageId, attempt, t]);
  if (error)
    return (
      <div
        role="alert"
        className="flex items-center gap-2 p-3 text-sm text-danger"
      >
        <span>{error}</span>
        <button
          className="app-button-ghost"
          onClick={() => setAttempt(attempt + 1)}
        >
          {t("common.retry")}
        </button>
      </div>
    );
  if (content === undefined)
    return (
      <div role="status" className="p-3 text-sm text-muted">
        {t("common.loading")}
      </div>
    );
  return (
    <CodeEditor
      file={{ path: "page.html", content }}
      ariaLabel={t("fileReader.source")}
      wrap
    />
  );
}
