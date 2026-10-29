import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutomationTask } from "../lib/tauri";
import { automationTime, automationSchedule } from "../lib/automation";
import { AutomationTaskIcon } from "./AutomationTaskIcon";
import { AutomationStatusBadge } from "./AutomationStatusBadge";
import { AutomationOriginBadge } from "./AutomationOriginBadge";
import { CopyPathButton } from "./CopyPathButton";
import { cn } from "../utils";

import { AutomationExecution } from "./AutomationExecution";

const tabs = ["overview", "runs", "technical"] as const;

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className="mt-1.5 whitespace-pre-wrap break-words text-[13px] font-medium leading-6 text-secondary">
        {value}
      </dd>
    </div>
  );
}

export function AutomationTaskDetail({
  task,
  projectName,
  refreshKey,
  loading,
  readFailed,
  onBack,
  onRefresh,
  children,
  actions,
}: {
  task: AutomationTask | undefined;
  projectName: string | null;
  refreshKey: number;
  loading: boolean;
  readFailed: boolean;
  onBack: () => void;
  onRefresh: () => void;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<(typeof tabs)[number]>("overview");
  const [runCount, setRunCount] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const container = heading.current?.closest(".overflow-y-auto");
    if (container) container.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
  }, [task?.id]);
  const unknown = t("automation.unknown");
  const nextRun =
    task?.status === "paused"
      ? t("automation.states.paused")
      : task?.definition?.schedule.kind === "manual"
        ? t("automation.schedules.manual")
        : automationTime(task?.next_run ?? null, i18n.language) || unknown;
  const lastResult =
    task?.status === "running"
      ? t("automation.states.running")
      : ["ok", "0"].includes(task?.last_result ?? "")
        ? t("automation.runSucceeded")
        : task?.last_result || unknown;
  const technicalFields: { key: string; value: string; copy?: boolean }[] = task
    ? [
        ...(task.identifier
          ? [{ key: "identifier", value: task.identifier }]
          : []),
        ...(task.bundle_id ? [{ key: "bundleId", value: task.bundle_id }] : []),
        { key: "location", value: task.location, copy: true },
      ]
    : [];
  return (
    <div className="app-page gap-5">
      <nav
        aria-label={t("automation.breadcrumb")}
        className="flex min-w-0 items-center gap-1.5 text-[13px]"
      >
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded py-1 text-muted hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t("automation.title")}
        </button>
        <ChevronRight
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-faint"
        />
        <span
          aria-current="page"
          className="truncate font-medium text-secondary"
        >
          {task?.name || t("automation.details")}
        </span>
      </nav>
      <div className="flex min-w-0 items-center gap-4 border-b border-border-subtle">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("automation.backToList")}
          title={t("automation.backToList")}
          className="app-button-ghost rounded-md hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent mb-1 p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        </button>
        <div
          role="tablist"
          aria-label={t("automation.details")}
          className="flex min-w-0 gap-5 overflow-x-auto"
        >
          {tabs.map((value, index) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`automation-detail-tab-${value}`}
              aria-selected={tab === value}
              aria-controls={`automation-detail-panel-${value}`}
              tabIndex={tab === value ? 0 : -1}
              onClick={() => setTab(value)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                setTab(tabs[next]);
                document
                  .getElementById(`automation-detail-tab-${tabs[next]}`)
                  ?.focus();
              }}
              className={cn(
                "whitespace-nowrap border-b-2 px-1 py-3 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
                tab === value
                  ? "border-accent text-primary"
                  : "border-transparent text-muted hover:text-primary",
              )}
            >
              {t(`automation.detailTabs.${value}`)}
              {value === "runs" && runCount !== null && (
                <span className="ml-1.5 text-[11px] text-muted">
                  {runCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle pb-5">
        <div className="flex min-w-0 flex-1 basis-[320px] items-start gap-3">
          {task && (
            <AutomationTaskIcon task={task} className="mt-0.5 h-10 w-10" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1
                ref={heading}
                tabIndex={-1}
                className="min-w-0 break-words text-xl font-semibold leading-7 tracking-tight text-primary outline-none"
              >
                {task?.name || t("automation.details")}
              </h1>
              {task && <AutomationOriginBadge origin={task.origin} />}
              {task && (
                <AutomationStatusBadge
                  status={task.status}
                  className="rounded-full border border-border px-2 py-0.5"
                />
              )}
            </div>
            {task && (
              <p
                title={task.project ?? undefined}
                className="mt-1.5 break-all text-[13px] leading-6 text-muted"
              >
                {projectName || t("automation.noProject")}
              </p>
            )}
          </div>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="app-button-secondary focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RefreshCw
              aria-hidden="true"
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
            {t("automation.refresh")}
          </button>
        </div>
      </header>
      {children}
      {!task ? (
        <p role="status" className="py-10 text-center text-[13px] text-muted">
          {loading
            ? t("common.loading")
            : readFailed
              ? t("automation.loadFailed")
              : t("automation.taskUnavailable")}
        </p>
      ) : (
        <>
          <div
            role="tabpanel"
            id="automation-detail-panel-overview"
            aria-labelledby="automation-detail-tab-overview"
            hidden={tab !== "overview"}
            tabIndex={0}
            className="space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <dl
              aria-label={t("automation.scheduleSummary")}
              className="grid grid-cols-2 gap-x-7 gap-y-5 rounded-lg border border-border-subtle bg-surface px-5 py-4 lg:grid-cols-4"
            >
              <Metric
                label={t("automation.columns.schedule")}
                value={automationSchedule(task, t)}
              />
              <Metric label={t("automation.columns.nextRun")} value={nextRun} />
              <Metric
                label={t("automation.columns.host")}
                value={t("automation.localHost")}
              />
              <Metric
                label={t("automation.columns.source")}
                value={t(`automation.sources.${task.source}`)}
              />
            </dl>
            <dl
              aria-label={t("automation.runSummary")}
              className="grid grid-cols-1 gap-5 rounded-lg border border-border-subtle bg-bg-secondary px-5 py-4 sm:grid-cols-2"
            >
              <Metric
                label={t("automation.columns.lastRun")}
                value={automationTime(task.last_run, i18n.language) || unknown}
              />
              <Metric
                label={t("automation.columns.lastResult")}
                value={lastResult}
              />
            </dl>
            {task.prompt && (
              <section className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
                <h2 className="border-b border-border-subtle px-5 py-3 text-[13px] font-semibold text-secondary">
                  {t("automation.prompt")}
                </h2>
                <div className="px-5 py-4">
                  <p className="max-w-[90ch] whitespace-pre-wrap break-words text-[13px] leading-7 text-secondary">
                    {task.prompt}
                  </p>
                </div>
              </section>
            )}
            {task.command && (
              <section className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
                <h2 className="border-b border-border-subtle px-5 py-3 text-[13px] font-semibold text-secondary">
                  {t("automation.command")}
                </h2>
                <pre className="whitespace-pre-wrap break-all px-5 py-4 text-[12px] leading-6 text-secondary">
                  {task.command}
                </pre>
              </section>
            )}
            {!task.can_edit && (
              <p className="text-[12px] leading-6 text-muted">
                {t("automation.externalReadOnly")}
              </p>
            )}
            {!task.prompt && !task.command && (
              <p className="py-3 text-[13px] text-muted">
                {t("automation.noContent")}
              </p>
            )}
          </div>
          <div
            role="tabpanel"
            id="automation-detail-panel-runs"
            aria-labelledby="automation-detail-tab-runs"
            hidden={tab !== "runs"}
            tabIndex={0}
            className="outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {tab === "runs" && (
              <AutomationExecution
                key={task.id}
                task={task}
                refreshKey={refreshKey}
                onCount={setRunCount}
              />
            )}
          </div>
          <div
            role="tabpanel"
            id="automation-detail-panel-technical"
            aria-labelledby="automation-detail-tab-technical"
            hidden={tab !== "technical"}
            tabIndex={0}
            className="outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <dl className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface">
              {technicalFields.map((field) => (
                <div
                  key={field.key}
                  className="grid gap-2 px-5 py-4 sm:grid-cols-[160px_minmax(0,1fr)]"
                >
                  <dt className="text-[12px] text-muted">
                    {t(`automation.columns.${field.key}`)}
                  </dt>
                  <dd className="flex min-w-0 items-start gap-2 text-secondary">
                    <span className="min-w-0 select-text break-all font-mono text-[12px] leading-6">
                      {field.value}
                    </span>
                    {field.copy && <CopyPathButton path={field.value} />}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
    </div>
  );
}
