import { useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  getRepositorySchedules,
  type RepositorySchedule,
  type TaskBinding,
} from "../../lib/tauri";
import { taskTime } from "../../lib/taskTime";
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
  const [linkError, setLinkError] = useState("");
  const { sources, loading } = useRepositoryInventory(
    bindings,
    refreshKey,
    scopeKey,
    discovering,
    getRepositorySchedules,
  );
  const rows = new Map<
    string,
    { binding: TaskBinding; item: RepositorySchedule }
  >();
  for (const { binding, inventory } of sources) {
    for (const item of inventory?.items ?? []) {
      rows.set(
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
  const all = [...rows.values()];
  const visible = [...rows].filter(([, { item }]) => matches(item, state));
  const busy = loading || discovering;
  const failures = sources.filter((source) => source.error);
  const jump = (value: string) => {
    setLinkError("");
    void openUrl(value).catch(() => setLinkError(t("common.error")));
  };
  return (
    <>
      <TaskScopeToolbar
        {...toolbar}
        leading={title}
        identities={[]}
        loading={busy}
      />
      {notice}
      {linkError && (
        <p role="alert" className="mb-2 text-xs text-danger">
          {linkError}
        </p>
      )}
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
              const status = item.last_status;
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
                          <button
                            type="button"
                            className="rounded hover:underline focus-visible:outline focus-visible:outline-accent"
                            onClick={() => jump(item.last_run_url!)}
                          >
                            {statusLabel}
                          </button>
                        ) : (
                          statusLabel
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {item.active === false ? "—" : taskTime(item.next_run_at)}
                  </td>
                  <td className="px-3 py-3">{item.owner ?? "—"}</td>
                  <td className="px-2 py-2.5">
                    <button
                      type="button"
                      title={t("schedules.open")}
                      aria-label={t("schedules.open")}
                      className="app-button-ghost h-7 w-7 p-0"
                      onClick={() => jump(item.url)}
                    >
                      <ExternalLink size={14} aria-hidden="true" />
                    </button>
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
