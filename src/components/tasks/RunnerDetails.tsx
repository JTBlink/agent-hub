import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RunnerActions } from "./RunnerActions";
import { RepositoryPlatformIcon } from "../RepositoryPlatformIcon";
import {
  cancelTaskQuery,
  getRepositoryRunnerDetails,
  taskFailure,
  type RepositoryRunner,
} from "../../lib/taskBrowserApi";
import { taskTime } from "../../lib/taskTime";
import { runnerReference, runnerStateLabel, runnerWork } from "./runnerStatus";
import type { VisibleRunner } from "./useRepositoryRunners";

export function RunnerDetails({
  id,
  item,
  projects,
  onClose,
  onInventoryChanged,
}: {
  id: string;
  item: VisibleRunner;
  projects: string[];
  onClose: () => void;
  onInventoryChanged: () => void;
}) {
  const { t } = useTranslation();
  const closeButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => closeButton.current?.focus(), []);
  const [result, setResult] = useState<
    { details: RepositoryRunner; bindingId: string } | { error: string }
  >();
  const [attempt, setAttempt] = useState(0);
  const { runner, bindings } = item;
  const { host, provider } = bindings[0];
  const gitlab = provider === "gitlab";
  useEffect(() => {
    if (!gitlab) return;
    let disposed = false;
    const id = crypto.randomUUID();
    async function load() {
      // Shared runners may be visible from bindings with different platform accounts.
      let error = "";
      for (const binding of bindings) {
        if (disposed) return;
        try {
          const details = await getRepositoryRunnerDetails(
            binding.id,
            runner.id,
            id,
          );
          if (!disposed) setResult({ details, bindingId: binding.id });
          return;
        } catch (reason) {
          error = taskFailure(reason).message;
        }
      }
      if (!disposed) setResult({ error });
    }
    void load();
    return () => {
      disposed = true;
      void cancelTaskQuery(id).catch(() => {});
    };
  }, [bindings, gitlab, runner.id, attempt]);
  const details = result && "details" in result ? result.details : undefined;
  const current: RepositoryRunner = details
    ? {
        ...runner,
        ...details,
        short_id: details.short_id ?? runner.short_id,
        paused: details.paused ?? runner.paused,
        job_status: details.job_status ?? runner.job_status,
        busy:
          details.job_status != null
            ? details.busy
            : (details.busy ?? runner.busy),
        state: details.state === "unknown" ? runner.state : details.state,
        os: details.os ?? runner.os,
        scope: details.scope ?? runner.scope,
        labels: details.labels ?? runner.labels,
        contacted_at: details.contacted_at ?? runner.contacted_at,
        created_by: details.created_by ?? runner.created_by,
        created_at: details.created_at ?? runner.created_at,
        version: details.version ?? runner.version,
        manager_address: details.manager_address ?? runner.manager_address,
        owner_project: details.owner_project ?? runner.owner_project,
        project_count: details.project_count ?? runner.project_count,
        locked: details.locked ?? runner.locked,
      }
    : runner;
  const unknown = t("runners.unknown");
  const fields = [
    [
      t("tasks.provider"),
      <RepositoryPlatformIcon
        providers={[provider]}
        fallbackLabel={t("tasks.provider")}
      />,
    ],
    [t("runners.host"), host],
    [t("runners.projects"), projects.join(", ")],
    ...(current.owner_project
      ? [[t("runners.owner"), current.owner_project]]
      : []),
    ...(current.project_count != null
      ? [[t("runners.projectCount"), current.project_count]]
      : []),
    ...(current.job_count != null
      ? [[t("runners.jobCount"), current.job_count]]
      : []),
    ...(current.version ? [[t("runners.version"), current.version]] : []),
    ...(current.manager_address
      ? [[t("runners.managerAddress"), current.manager_address]]
      : []),
    ...(current.locked != null
      ? [
          [
            t("runners.locked"),
            t(current.locked ? "runners.yes" : "runners.no"),
          ],
        ]
      : []),
    ...(current.created_by ? [[t("runners.creator"), current.created_by]] : []),
    ...(current.created_at
      ? [[t("runners.createdAt"), taskTime(current.created_at)]]
      : []),
    [t("runners.connection"), runnerStateLabel(current.state, t)],
    [
      t("runners.paused"),
      (details?.paused ?? runner.paused) === null
        ? unknown
        : t((details?.paused ?? runner.paused) ? "runners.yes" : "runners.no"),
    ],
    [t("runners.os"), current.os ?? "—"],
    [t("runners.scope"), current.scope ? t(`runners.${current.scope}`) : "—"],
    [t("runners.work"), runnerWork(current, t)],
    [
      t("runners.contacted"),
      current.contacted_at ? taskTime(current.contacted_at) : "—",
    ],
    [t("runners.labels"), current.labels?.join(", ") || "—"],
  ];
  return (
    <aside
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex min-h-0 w-2/5 min-w-56 max-w-[420px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface"
    >
      <div className="flex shrink-0 items-start gap-2 border-b border-border-subtle px-4 py-2">
        <h2
          id={`${id}-title`}
          className="min-w-0 flex-1 break-words py-1 text-lg font-semibold"
        >
          {t("runners.details", {
            name: runner.name,
            reference: runnerReference(current),
          })}
        </h2>
        <button
          ref={closeButton}
          type="button"
          aria-label={t("common.close")}
          className="app-button-ghost h-7 w-7 shrink-0 p-0"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {gitlab &&
          result &&
          "details" in result &&
          (result.details.can_update || result.details.can_delete) && (
            <RunnerActions
              bindingId={result.bindingId}
              host={host}
              runner={current}
              onChanged={(action) => {
                onInventoryChanged();
                if (action === "delete") onClose();
                else {
                  setResult(undefined);
                  setAttempt((value) => value + 1);
                }
              }}
            />
          )}
        {gitlab && !result && (
          <p role="status" className="mb-3 text-xs text-muted">
            {t("common.loading")}
          </p>
        )}
        {result && "error" in result && (
          <div role="alert" className="mb-3 text-xs text-warning">
            <p>
              {t("runners.detailUnavailable")} {result.error}
            </p>
            <button
              type="button"
              className="app-button-ghost"
              onClick={() => {
                setResult(undefined);
                setAttempt((value) => value + 1);
              }}
            >
              {t("common.retry")}
            </button>
          </div>
        )}
        <p className="mb-4 text-xs text-muted">
          {t(
            current.state === "offline"
              ? "runners.offlineHelp"
              : (details?.paused ?? runner.paused)
                ? "runners.pausedHelp"
                : "runners.eligibilityHelp",
          )}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
          {fields.map(([label, value]) => (
            <div key={String(label)} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
