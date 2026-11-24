import { useCallback, useMemo, useState, type ReactNode } from "react";
import { GitBranch } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getRepositorySchedules,
  type RepositorySchedule,
  type TaskBinding,
} from "../../lib/tauri";
import { scheduleContext } from "../../lib/scheduleContext";
import { taskTime } from "../../lib/taskTime";
import { CopyTextButton } from "../CopyTextButton";
import { isLiveScheduleRun, useScheduleProgress } from "./useScheduleProgress";
import { GitlabScheduleActions } from "./gitlab/ScheduleActions";
import { PlatformOpenButton } from "../PlatformOpenButton";
import { ScheduleRunStatus } from "./ScheduleRunStatus";
import { RepositoryPlatformIcon } from "../RepositoryPlatformIcon";
import { SingleChoiceGroup } from "../SingleChoiceGroup";
import {
  TaskScopeToolbar,
  type TaskScopeToolbarProps,
} from "./TaskScopeToolbar";
import { useRepositoryInventory } from "./useRepositoryInventory";

const states = ["all", "active", "inactive"] as const;
type ScheduleFilter = (typeof states)[number];

function matches(schedule: RepositorySchedule, state: ScheduleFilter) {
  return state === "all" || schedule.active === (state === "active");
}

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
  const [runRefresh, setRunRefresh] = useState(0);
  const onRunAccepted = useCallback(
    () => setRunRefresh((value) => value + 1),
    [],
  );
  const [state, setState] = useState<ScheduleFilter>("all");
  const { sources, loading } = useRepositoryInventory(
    bindings,
    refreshKey + runRefresh,
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
        <table className="w-full min-w-[1040px] table-fixed text-left text-xs">
          <colgroup>
            <col />
            <col className="w-[15%]" />
            <col className="w-[11%]" />
            <col className="w-[18%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
            <col className="w-40" />
          </colgroup>
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
                  className="whitespace-nowrap px-4 py-3 font-medium"
                >
                  {t(`schedules.${column}`)}
                </th>
              ))}
              <th scope="col" className="w-40">
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
              return (
                <tr
                  key={key}
                  className="h-24 border-t border-border-subtle align-middle hover:bg-surface-hover"
                >
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-2.5">
                      <RepositoryPlatformIcon
                        providers={[binding.provider]}
                        fallbackLabel={t("tasks.provider")}
                      />
                      <div className="min-w-0">
                        <CopyTextButton
                          text={scheduleContext(binding, item, status)}
                          label={`${t("schedules.copyContext")}: ${item.title}`}
                          copiedMessage={t("schedules.copied")}
                          className="block max-w-full break-words p-0 text-left text-sm font-medium text-primary hover:text-accent"
                        >
                          {item.title}
                        </CopyTextButton>
                        <div className="mt-1 break-words text-xs text-muted">
                          <CopyTextButton
                            text={binding.repository}
                            label={`${t("schedules.copyRepository")}: ${binding.repository}`}
                            copiedMessage={t("schedules.copied")}
                            className="max-w-full break-words p-0 text-left text-xs text-muted hover:text-accent"
                          >
                            {binding.repository}
                          </CopyTextButton>
                          {item.active === false &&
                            ` · ${t("schedules.inactive")}`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="space-y-1 px-4 py-4">
                    {item.rules.map((rule, index) => (
                      <div key={`${rule.cron}/${rule.timezone}/${index}`}>
                        <code className="break-words font-mono leading-relaxed">
                          {rule.cron}
                        </code>
                        {rule.timezone && (
                          <span className="block text-muted">
                            {rule.timezone}
                          </span>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex max-w-full items-start gap-1.5">
                      {item.target && (
                        <GitBranch
                          size={14}
                          aria-hidden="true"
                          className="mt-0.5 shrink-0 text-muted"
                        />
                      )}
                      <span className="break-all">{item.target ?? "—"}</span>
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <ScheduleRunStatus
                      status={status}
                      url={item.last_run_url}
                      host={binding.host}
                      progress={sample}
                    />
                  </td>
                  <td className="px-4 py-4 tabular-nums">
                    {item.active === false ? "—" : taskTime(item.next_run_at)}
                  </td>
                  <td className="break-words px-4 py-4">{item.owner ?? "—"}</td>
                  <td className="px-3 py-4">
                    {binding.provider === "gitlab" ? (
                      <GitlabScheduleActions
                        binding={binding}
                        schedule={item}
                        onChanged={onRunAccepted}
                      />
                    ) : (
                      <PlatformOpenButton
                        url={item.url}
                        host={binding.host}
                        label={t("tasks.openRemote")}
                      />
                    )}
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
