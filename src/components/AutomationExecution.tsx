import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getAutomationHistory,
  type AutomationHistory,
  type AutomationTask,
} from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { automationTime } from "../lib/automation";
import { AutomationStatusBadge } from "./AutomationStatusBadge";
import { AutomationRunOutputPanel } from "./AutomationRunOutput";

export function AutomationExecution({
  task,
  refreshKey,
  onCount,
}: {
  task: AutomationTask;
  refreshKey: number;
  onCount: (count: number | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const [history, setHistory] = useState<AutomationHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [selectedId, select] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getAutomationHistory(task.id)
      .then((value) => {
        if (active) {
          setHistory((previous) =>
            JSON.stringify(previous) === JSON.stringify(value)
              ? previous
              : value,
          );
          setError(null);
          onCount(value.kind === "unsupported" ? null : value.runs.length);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(getErrorMessage(cause, ""));
      });
    return () => {
      active = false;
    };
  }, [task.id, refreshKey, retry, onCount]);
  const saved = history?.kind === "hermes_outputs";
  const time = (value: string | null) =>
    value ? (saved ? value : automationTime(value, i18n.language)) : "—";
  const selected = history?.runs.find((run) => run.id === selectedId);
  const runStatus =
    selected &&
    (saved ? (
      <span className="text-[12px] text-muted">
        {t("automation.history.saved")}
      </span>
    ) : (
      <AutomationStatusBadge status={selected.status} />
    ));
  return (
    <section className="space-y-4" aria-label={t("automation.history.title")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-secondary">
          {selectedId ? (
            <button
              type="button"
              onClick={() => select(null)}
              className="app-button-secondary"
            >
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
              {t("automation.history.back")}
            </button>
          ) : (
            <>
              <History aria-hidden="true" className="h-4 w-4 text-muted" />
              {t(
                saved
                  ? "automation.history.savedResults"
                  : "automation.history.title",
              )}
            </>
          )}
        </div>
        <p className="text-[12px] text-muted">
          {t("automation.history.localOnly")}
        </p>
      </header>
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 px-4 py-3 text-[12px] text-danger"
        >
          <p>
            {t("automation.history.loadFailed")}: {error}
          </p>
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="app-button-secondary"
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      {saved && (
        <p className="text-[12px] leading-6 text-muted">
          {t("automation.history.hermesNote")}
        </p>
      )}
      {!history ? (
        !error && (
          <p role="status" className="p-5 text-[13px] text-muted">
            {t("common.loading")}
          </p>
        )
      ) : selectedId ? (
        selected ? (
          <>
            <dl className="grid grid-cols-2 gap-5 rounded-lg border border-border-subtle bg-surface px-5 py-4 text-[13px] lg:grid-cols-4">
              <div>
                <dt className="text-[11px] text-muted">
                  {t("automation.columns.status")}
                </dt>
                <dd className="mt-2">{runStatus}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted">
                  {t(
                    saved
                      ? "automation.history.savedAt"
                      : "automation.history.startedAt",
                  )}
                </dt>
                <dd className="mt-2 text-secondary">
                  {time(selected.started_at ?? selected.finished_at)}
                </dd>
              </div>
              {!saved && (
                <>
                  <div>
                    <dt className="text-[11px] text-muted">
                      {t("automation.history.finishedAt")}
                    </dt>
                    <dd className="mt-2 text-secondary">
                      {time(selected.finished_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted">
                      {t("automation.history.exitCode")}
                    </dt>
                    <dd className="mt-2 text-secondary">
                      {selected.exit_code ?? "—"}
                    </dd>
                  </div>
                </>
              )}
            </dl>
            <AutomationRunOutputPanel
              key={`${task.id}:${selected.id}`}
              taskId={task.id}
              run={selected}
              refreshKey={refreshKey}
            />
          </>
        ) : (
          <p role="status" className="py-10 text-center text-[13px] text-muted">
            {t("automation.history.unavailable")}
          </p>
        )
      ) : !history.runs.length ? (
        <p
          role="status"
          className="rounded-lg border border-border-subtle bg-surface px-5 py-12 text-center text-[13px] text-muted"
        >
          {t(
            history.kind === "unsupported"
              ? "automation.history.unsupported"
              : "automation.history.empty",
          )}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
          <table className="w-full min-w-[520px] text-left text-[12px]">
            <caption className="sr-only">
              {t("automation.history.title")}
            </caption>
            <thead className="border-b border-border-subtle bg-bg-secondary text-muted">
              <tr>
                {(saved
                  ? ["savedAt", "status"]
                  : ["startedAt", "finishedAt", "status", "exitCode"]
                ).map((key) => (
                  <th key={key} scope="col" className="px-5 py-3 font-medium">
                    {t(
                      key === "status"
                        ? "automation.columns.status"
                        : `automation.history.${key}`,
                    )}
                  </th>
                ))}
                <th scope="col">
                  <span className="sr-only">
                    {t("automation.history.viewOutput")}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {history.runs.map((run) => (
                <tr key={run.id} className="hover:bg-surface-hover">
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      data-run-id={run.id}
                      onClick={() => select(run.id)}
                      className="rounded text-left font-medium text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {time(run.started_at ?? run.finished_at)}
                    </button>
                  </td>
                  {!saved && (
                    <td className="px-5 py-4 text-muted">
                      {time(run.finished_at)}
                    </td>
                  )}
                  <td className="px-5 py-4">
                    {saved ? (
                      <span className="text-muted">
                        {t("automation.history.saved")}
                      </span>
                    ) : (
                      <AutomationStatusBadge status={run.status} />
                    )}
                  </td>
                  {!saved && (
                    <td className="px-5 py-4 text-muted">
                      {run.exit_code ?? "—"}
                    </td>
                  )}
                  <td className="pr-4">
                    <button
                      type="button"
                      aria-label={t("automation.history.viewRun", {
                        time: time(run.started_at ?? run.finished_at),
                      })}
                      onClick={() => select(run.id)}
                      className="app-button-ghost rounded p-2 focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border-subtle px-5 py-3 text-[11px] text-muted">
            {t("automation.history.retention")}
          </p>
        </div>
      )}
    </section>
  );
}
