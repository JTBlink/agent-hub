import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  getRepositorySchedules,
  type RepositorySchedule,
  type TaskBinding,
} from "../../lib/tauri";
import { taskTime } from "../../lib/taskTime";
import { PlatformOpenButton } from "../PlatformOpenButton";
import { isLiveScheduleRun, useScheduleProgress } from "./useScheduleProgress";
import { ScheduleProgressIndicator } from "./ScheduleProgressIndicator";
import { RepositoryPlatformIcon } from "../RepositoryPlatformIcon";
import { SingleChoiceGroup } from "../SingleChoiceGroup";
import {
  TaskScopeToolbar,
  type TaskScopeToolbarProps,
} from "./TaskScopeToolbar";
import { useRepositoryInventory } from "./useRepositoryInventory";
import { cn } from "../../utils";

const states = ["all", "active", "inactive"] as const;
type ScheduleFilter = (typeof states)[number];

function matches(schedule: RepositorySchedule, state: ScheduleFilter) {
  return state === "all" || schedule.active === (state === "active");
}

const statuses = {
  success: "passed",
  running: "running",
  in_progress: "running",
  pending: "pending",
  queued: "pending",
  failed: "failed",
  failure: "failed",
  canceled: "canceled",
  cancelled: "canceled",
} as const;

export function SchedulesWorkspace({
  bindings,
  title,
  discovering,
  notice,
  scopeKey,
  refreshKey,
  toolbar,
}: {
  bindings: TaskBinding[];
  title: ReactNode;
  discovering: boolean;
  notice?: ReactNode;
  scopeKey: string;
  refreshKey: number;
  toolbar: Omit<
    TaskScopeToolbarProps,
    "identities" | "leading" | "loading" | "children"
  >;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<ScheduleFilter>("all");
  const { sources, loading } = useRepositoryInventory(
    bindings,
    refreshKey,
    scopeKey,
    discovering,
    getRepositorySchedules,
  );
  const rows = useMemo(() => {
    const entries = new Map<
      string,
      { binding: TaskBinding; item: RepositorySchedule }
    >();
    for (const { binding, inventory } of sources) {
      for (const item of inventory?.items ?? []) {
        entries.set(
          JSON.stringify([
            binding.provider,
            binding.host,
            binding.repository,
            item.id,
          ]),
          { binding, item },
        );
      }
    }
    return entries;
  }, [sources]);
  const all = [...rows.values()];
  const visible = useMemo(
    () => [...rows].filter(([, { item }]) => matches(item, state)),
    [rows, state],
  );
  const targets = useMemo(
    () =>
      visible.flatMap(([key, { binding, item }]) =>
        item.last_run_id && isLiveScheduleRun(item.last_status)
          ? [
              {
                key: `${key}/${item.last_run_id}`,
                bindingId: binding.id,
                runId: item.last_run_id,
              },
            ]
          : [],
      ),
    [visible],
  );
  const progress = useScheduleProgress(targets, scopeKey);
  const busy = loading || discovering;
  const failures = sources.filter((source) => source.error);
  return (
    <>
      <TaskScopeToolbar
        {...toolbar}
        leading={title}
        identities={[]}
        loading={busy}
      />
      {notice}
      {failures.map(({ binding, error }) => (
        <p role="alert" key={binding.id} className="mb-2 text-xs text-warning">
          {binding.host}/{binding.repository} ·{" "}
          {t(`tasks.errors.${error?.kind}`, {
            defaultValue: t("common.error"),
          })}{" "}
          · {error?.message}
        </p>
      ))}
      {sources.some((source) => source.inventory?.limited) && (
        <p role="status" className="mb-2 text-xs text-warning">
          {t("schedules.limited")}
        </p>
      )}
      <div className="mb-2">
        <SingleChoiceGroup
          label={t("schedules.status")}
          value={state}
          onChange={setState}
          options={states.map((value) => ({
            value,
            label: `${t(`schedules.${value}`)} (${all.filter(({ item }) => matches(item, value)).length})`,
          }))}
        />
      </div>
      <div aria-busy={busy} className="app-panel min-h-0 overflow-auto">
        <table className="w-full min-w-[740px] text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-border-subtle bg-bg-secondary text-muted">
            <tr>
              {[
                "title",
                "interval",
                "target",
                "lastRun",
                "nextRun",
                "owner",
              ].map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2 font-medium"
                >
                  {t(`schedules.${column}`)}
                </th>
              ))}
              <th scope="col" className="w-12">
                <span className="sr-only">{t("schedules.open")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map(([key, { binding, item }]) => {
              const sample = progress[`${key}/${item.last_run_id}`];
              const status =
                sample && "progress" in sample
                  ? (sample.progress.status ?? item.last_status)
                  : item.last_status;
              const normalized =
                status && Object.prototype.hasOwnProperty.call(statuses, status)
                  ? statuses[status as keyof typeof statuses]
                  : null;
              const statusLabel = normalized
                ? t(`schedules.run.${normalized}`)
                : status;
              return (
                <tr
                  key={key}
                  className="border-t border-border-subtle align-top hover:bg-surface-hover"
                >
                  <td className="min-w-48 px-3 py-3">
                    <div className="flex items-start gap-2">
                      <RepositoryPlatformIcon
                        providers={[binding.provider]}
                        fallbackLabel={t("tasks.provider")}
                      />
                      <div className="min-w-0">
                        <div className="break-words text-sm font-medium">
                          {item.title}
                        </div>
                        <div className="break-words text-xs text-muted">
                          {binding.repository}
                          {item.active === false &&
                            ` · ${t("schedules.inactive")}`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="space-y-1 px-3 py-3">
                    {item.rules.map((rule, index) => (
                      <div key={`${rule.cron}/${rule.timezone}/${index}`}>
                        <code className="whitespace-nowrap">{rule.cron}</code>
                        {rule.timezone && (
                          <span className="block text-muted">
                            {rule.timezone}
                          </span>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-3">{item.target ?? "—"}</td>
                  <td className="px-3 py-3">
                    {statusLabel ? (
                      <span
                        className={cn(
                          "inline-flex rounded-md bg-surface-active px-1.5 py-0.5",
                          normalized === "passed" && "text-success",
                          normalized === "failed" && "text-danger",
                        )}
                      >
                        {item.last_run_url ? (
                          <PlatformOpenButton
                            url={item.last_run_url}
                            host={binding.host}
                            label={t("schedules.openRun", {
                              status: statusLabel,
                            })}
                            className="rounded hover:underline focus-visible:outline focus-visible:outline-accent"
                          >
                            {statusLabel}
                          </PlatformOpenButton>
                        ) : (
                          statusLabel
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                    {sample && <ScheduleProgressIndicator result={sample} />}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {item.active === false ? "—" : taskTime(item.next_run_at)}
                  </td>
                  <td className="px-3 py-3">{item.owner ?? "—"}</td>
                  <td className="px-2 py-2.5">
                    <PlatformOpenButton
                      url={item.url}
                      host={binding.host}
                      label={t("tasks.openRemote")}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!busy && !visible.length && (!failures.length || all.length > 0) && (
          <p className="p-8 text-center text-sm text-muted">
            {t(
              all.length
                ? "schedules.noMatch"
                : bindings.length
                  ? "schedules.empty"
                  : "tasks.notConnected",
            )}
          </p>
        )}
      </div>
    </>
  );
}
