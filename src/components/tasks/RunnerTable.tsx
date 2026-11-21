import { useTranslation } from "react-i18next";
import { RepositoryPlatformIcon } from "../RepositoryPlatformIcon";
import { taskTime } from "../../lib/taskTime";
import { cn } from "../../utils";
import {
  runnerReference,
  runnerStateLabel,
  runnerTimeAgo,
  runnerWork,
} from "./runnerStatus";
import type { VisibleRunner } from "./useRepositoryRunners";

export function RunnerTable({
  items,
  visible,
  selectedKey,
  detailsId,
  tag,
  relativeTime,
  projectNames,
  onTag,
  onSelect,
}: {
  items: VisibleRunner[];
  visible: VisibleRunner[];
  selectedKey?: string;
  detailsId: string;
  tag: string | null;
  relativeTime: Intl.RelativeTimeFormat;
  projectNames: (item: VisibleRunner) => string[];
  onTag: (tag: string | null) => void;
  onSelect: (item: VisibleRunner, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation();
  const hasWork = items.some(
    ({ runner }) => runner.busy != null || runner.job_status,
  );
  const hasSystem = items.some(({ runner }) => runner.os);
  const hasTags = items.some(({ runner }) => Boolean(runner.labels?.length));
  const hasContact = items.some(({ runner }) => runner.contacted_at);
  const columns = [
    "machine",
    "connection",
    ...(hasWork ? ["work"] : []),
    hasSystem ? "systemScope" : "scope",
    "projects",
    ...(hasTags ? ["labels"] : []),
    ...(hasContact ? ["contacted"] : []),
  ];
  return (
    <table className="w-full min-w-[650px] text-left text-xs">
      <thead className="sticky top-0 z-10 bg-bg-secondary text-muted">
        <tr>
          {columns.map((column) => (
            <th
              key={column}
              scope="col"
              className="whitespace-nowrap px-3 py-2 font-medium"
            >
              {t(`runners.${column}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {visible.map((item) => {
          const {
            runner,
            bindings: [source],
          } = item;
          const selected = item.key === selectedKey;
          const title = runnerReference(runner);
          const created = runnerTimeAgo(runner.created_at, relativeTime);
          const identity = [
            title,
            source.host,
            runner.created_by &&
              t("runners.createdBy", { name: runner.created_by }),
            created,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <tr
              key={item.key}
              className={cn(
                "border-t border-border-subtle hover:bg-surface-hover",
                selected && "bg-surface-active",
              )}
            >
              <td className="w-[32%] min-w-52 px-3 py-2">
                <button
                  type="button"
                  aria-expanded={selected}
                  aria-controls={selected ? detailsId : undefined}
                  onClick={(event) => onSelect(item, event.currentTarget)}
                  className="flex w-full items-start gap-2 rounded text-left hover:text-accent focus-visible:outline focus-visible:outline-accent"
                >
                  <RepositoryPlatformIcon
                    providers={[source.provider]}
                    fallbackLabel={t("tasks.provider")}
                  />
                  <span className="block min-w-0 flex-1">
                    <span
                      title={runner.name}
                      className="block max-w-80 truncate text-sm font-medium"
                    >
                      {runner.name}
                    </span>
                    <span
                      title={identity}
                      className="block max-w-80 truncate text-xs text-muted"
                    >
                      {identity}
                    </span>
                  </span>
                </button>
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                <span
                  className={cn(
                    runner.state === "online" && "text-success",
                    runner.state === "offline" && "text-danger",
                    runner.state === "stale" && "text-warning",
                  )}
                >
                  {runnerStateLabel(runner.state, t)}
                </span>
                {runner.paused && (
                  <span className="block text-xs text-warning">
                    {t("runners.paused")}
                  </span>
                )}
              </td>
              {hasWork && (
                <td className="whitespace-nowrap px-3 py-2">
                  {runnerWork(runner, t)}
                </td>
              )}
              <td className="whitespace-nowrap px-3 py-2">
                {hasSystem && (runner.os ?? "—")}
                <span
                  className={hasSystem ? "block text-xs text-muted" : undefined}
                >
                  {runner.scope ? t(`runners.${runner.scope}`) : "—"}
                </span>
              </td>
              <td className="px-3 py-2">
                {item.assignable ? "—" : projectNames(item).join(", ")}
              </td>
              {hasTags && (
                <td className="min-w-32 px-3 py-2">
                  {runner.labels?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {[...new Set(runner.labels)].map((label) => (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={tag === label}
                          className={cn(
                            "max-w-full break-words rounded bg-surface-hover px-1.5 py-px text-xs text-secondary hover:text-accent focus-visible:outline focus-visible:outline-accent",
                            tag === label && "text-accent",
                          )}
                          onClick={() => onTag(tag === label ? null : label)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
              )}
              {hasContact && (
                <td
                  className="whitespace-nowrap px-3 py-2"
                  title={
                    runner.contacted_at
                      ? taskTime(runner.contacted_at)
                      : undefined
                  }
                >
                  {runnerTimeAgo(runner.contacted_at, relativeTime) || "—"}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
