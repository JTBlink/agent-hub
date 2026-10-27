import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getAutomationOutput,
  type AutomationRun,
  type AutomationRunOutput,
} from "../lib/tauri";
import { getErrorMessage } from "../lib/error";

export function AutomationRunOutputPanel({
  taskId,
  run,
  refreshKey,
}: {
  taskId: string;
  run: AutomationRun;
  refreshKey: number;
}) {
  const { t } = useTranslation();
  const [result, setResult] = useState<{
    output?: AutomationRunOutput;
    error?: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!run.has_output) return;
    let active = true;
    void getAutomationOutput(taskId, run.id)
      .then((output) => {
        if (active)
          setResult((previous) =>
            !previous?.error &&
            JSON.stringify(previous?.output) === JSON.stringify(output)
              ? previous
              : { output },
          );
      })
      .catch((cause: unknown) => {
        if (active)
          setResult((previous) => ({
            output: previous?.output,
            error: getErrorMessage(cause, ""),
          }));
      });
    return () => {
      active = false;
    };
  }, [
    taskId,
    run.id,
    run.status,
    run.finished_at,
    run.has_output,
    refreshKey,
    retry,
  ]);
  const output = result?.output;
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-border-subtle bg-surface">
      <h3 className="border-b border-border-subtle px-5 py-3 text-[13px] font-semibold text-secondary">
        {t("automation.history.output")}
      </h3>
      {result?.error !== undefined && (
        <div role="alert" className="space-y-3 p-5 text-[12px] text-danger">
          <p>
            {t("automation.execution.outputFailed")}: {result.error}
          </p>
          <button
            type="button"
            className="app-button-secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            {t("common.retry")}
          </button>
        </div>
      )}
      {!run.has_output ? (
        <p className="p-5 text-[13px] text-muted">
          {t("automation.execution.noOutput")}
        </p>
      ) : !output ? (
        !result?.error && (
          <p role="status" className="p-5 text-[13px] text-muted">
            {t("common.loading")}
          </p>
        )
      ) : (
        <>
          {output.truncated && (
            <p className="border-b border-border-subtle px-5 py-2 text-[12px] text-muted">
              {t("automation.execution.truncated")}
            </p>
          )}
          <pre
            tabIndex={0}
            className="max-h-[560px] min-h-[240px] overflow-auto whitespace-pre-wrap break-words bg-bg-secondary p-5 font-mono text-[12px] leading-6 text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {output.content || t("automation.execution.emptyOutput")}
          </pre>
        </>
      )}
    </section>
  );
}
