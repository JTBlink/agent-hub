import { useEffect, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getAutomationOutput,
  type AutomationTask,
  type AutomationRunOutput,
} from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { automationTime } from "../lib/automation";
import { AutomationStatusBadge } from "./AutomationStatusBadge";

export function AutomationExecution({
  task,
  refreshKey,
}: {
  task: AutomationTask;
  refreshKey: number;
}) {
  const { t, i18n } = useTranslation();
  const [result, setResult] = useState<{
    execution: string | null;
    output?: AutomationRunOutput;
    error?: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void getAutomationOutput(task.id)
      .then((output) => {
        if (active)
          setResult((previous) =>
            previous?.execution === task.last_run &&
            !previous.error &&
            JSON.stringify(previous.output) === JSON.stringify(output)
              ? previous
              : { execution: task.last_run, output },
          );
      })
      .catch((cause: unknown) => {
        if (active)
          setResult((previous) => ({
            execution: task.last_run,
            output:
              previous?.execution === task.last_run
                ? previous.output
                : undefined,
            error: getErrorMessage(cause, ""),
          }));
      });
    return () => {
      active = false;
    };
  }, [
    task.id,
    task.last_run,
    task.last_result,
    task.status,
    refreshKey,
    retry,
  ]);
  const current = result?.execution === task.last_run ? result : null;
  const output = current?.output;
  const runResult =
    task.status === "running"
      ? t("automation.states.running")
      : ["ok", "0"].includes(task.last_result ?? "")
        ? t("automation.runSucceeded")
        : task.last_result || t("automation.unknown");
  return (
    <section className="space-y-4" aria-label={t("automation.detailTabs.runs")}>
      <dl className="grid grid-cols-1 gap-5 rounded-lg border border-border-subtle bg-surface px-5 py-4 sm:grid-cols-3 text-[13px]">
        <div>
          <dt className="text-[11px] text-muted">
            {t("automation.columns.status")}
          </dt>
          <dd className="mt-2">
            <AutomationStatusBadge status={task.status} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">
            {t("automation.columns.lastRun")}
          </dt>
          <dd className="mt-2 text-secondary">
            {automationTime(task.last_run, i18n.language) ||
              t("automation.unknown")}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">
            {t("automation.columns.lastResult")}
          </dt>
          <dd className="mt-2 break-words text-secondary">{runResult}</dd>
        </div>
      </dl>
      <section className="min-w-0 overflow-hidden rounded-lg border border-border-subtle bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-3">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-secondary">
            <FileText aria-hidden="true" className="h-4 w-4 text-muted" />
            {t("automation.execution.output")}
          </h2>
          <p className="text-[12px] text-muted">
            {t("automation.execution.noHistory")}
          </p>
        </header>
        {current?.error !== undefined && (
          <div role="alert" className="space-y-3 p-5 text-[12px] text-danger">
            <p>
              {t("automation.execution.outputFailed")}: {current.error}
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
        {!output ? (
          !current?.error && (
            <p role="status" className="p-5 text-[13px] text-muted">
              {t("common.loading")}
            </p>
          )
        ) : !output.available ? (
          <p
            role="status"
            className="px-5 py-12 text-center text-[13px] text-muted"
          >
            {t(
              output.kind === "unsupported"
                ? "automation.execution.unsupported"
                : "automation.execution.noOutput",
            )}
          </p>
        ) : (
          <>
            {output.kind === "hermes" && (
              <p className="border-b border-border-subtle px-5 py-3 text-[12px] leading-6 text-muted">
                {t("automation.execution.hermesNote")}
              </p>
            )}
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
    </section>
  );
}
