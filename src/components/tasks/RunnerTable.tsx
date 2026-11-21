import { LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PlatformOpenButton } from "../PlatformOpenButton";
import { runnerPlatformUrl } from "../../lib/platformLinks";
import { RepositoryPlatformIcon } from "../RepositoryPlatformIcon";
import { taskTime } from "../../lib/taskTime";
import { cn } from "../../utils";
import { RunnerActions } from "./RunnerActions";
import {
  runnerReference,
  runnerStateLabel,
  runnerTimeAgo,
  runnerWork,
} from "./runnerStatus";
import type { VisibleRunner } from "./useRepositoryRunners";

function canManage({ runner, bindings: [source], assignable }: VisibleRunner) {
  return (
    source.provider === "gitlab" &&
    !assignable &&
    (runner.can_update === true || runner.can_delete === true)
  );
}

export function RunnerTable({
  items,
  visible,
  selectedKey,
  detailsId,
  tag,
  relativeTime,
  projectNames,
  onTag,
  onManaged,
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
  onManaged: (item: VisibleRunner, deleted: boolean) => void;
  onSelect: (item: VisibleRunner, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation();
  const hasActions = items.length > 0;
  return (
    <table className="w-full min-w-[680px] table-fixed text-left text-xs">
      <thead className="sticky top-0 z-10 border-b border-border-subtle bg-bg-secondary text-muted">
        <tr>
          <th scope="col" className="w-32 px-3 py-2 font-medium">
            {t("runners.status")}
          </th>
          <th scope="col" className="px-3 py-2 font-medium">
            {t("runners.configuration")}
          </th>
          <th scope="col" className="w-[20%] px-3 py-2 font-medium">
            {t("runners.owner")}
          </th>
          {hasActions && (
            <th
              scope="col"
              className="sticky right-0 w-[134px] bg-bg-secondary px-3 py-2 text-right font-medium"
            >
              {t("runners.actions.label")}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {visible.map((item) => {
          const {
            runner,
            bindings: [source],
          } = item;
          const selected = item.key === selectedKey;
          const work = runnerWork(runner, t);
          const owner = runner.owner_project?.split("/").at(-1);
          const projects = item.assignable ? [] : projectNames(item);
          const created = runnerTimeAgo(runner.created_at, relativeTime);
          const contacted = runnerTimeAgo(runner.contacted_at, relativeTime);
          const detail = [
            runner.version && `${t("runners.version")} ${runner.version}`,
            runner.os,
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
              <td className="px-3 py-3 align-top">
                <div className="flex flex-wrap items-center gap-1">
                  <span
                    className={cn(
                      "rounded-md bg-surface-active px-1.5 py-0.5 font-medium",
                      runner.state === "online" && "text-success",
                      runner.state === "offline" && "text-danger",
                      runner.state === "stale" && "text-warning",
                    )}
                    title={t("runners.connection")}
                  >
                    {runnerStateLabel(runner.state, t)}
                  </span>
                  {work !== "—" && (
                    <span
                      className="rounded-md border border-border-subtle px-1.5 py-0.5 text-secondary"
                      title={t("runners.work")}
                    >
                      {work}
                    </span>
                  )}
                  {runner.paused && (
                    <span className="rounded-md px-1.5 py-0.5 text-warning">
                      {t("runners.paused")}
                    </span>
                  )}
                </div>
              </td>
              <td className="min-w-0 space-y-1 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <RepositoryPlatformIcon
                    providers={[source.provider]}
                    fallbackLabel={t("tasks.provider")}
                  />
                  <button
                    type="button"
                    aria-expanded={selected}
                    aria-controls={selected ? detailsId : undefined}
                    onClick={(event) => onSelect(item, event.currentTarget)}
                    className="rounded text-left text-sm font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-accent"
                  >
                    {runnerReference(runner)}
                  </button>
                  {runner.locked && (
                    <span
                      title={t("runners.locked")}
                      role="img"
                      aria-label={t("runners.locked")}
                    >
                      <LockKeyhole size={12} aria-hidden="true" />
                    </span>
                  )}
                  {runner.scope && (
                    <span className="rounded bg-surface-active px-1.5 text-muted">
                      {t(`runners.${runner.scope}`)}
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 items-baseline gap-2">
                  <span
                    title={runner.name}
                    className="min-w-0 truncate text-sm font-medium"
                  >
                    {runner.name}
                  </span>
                  {detail && (
                    <span className="shrink-0 text-muted">{detail}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-muted">
                  <span className="max-w-full truncate" title={source.host}>
                    {source.host}
                  </span>
                  {contacted && (
                    <time
                      dateTime={runner.contacted_at ?? undefined}
                      title={taskTime(runner.contacted_at)}
                    >
                      {t("runners.contacted")} {contacted}
                    </time>
                  )}
                  {(runner.created_by || created) && (
                    <span
                      title={
                        runner.created_at
                          ? taskTime(runner.created_at)
                          : undefined
                      }
                    >
                      {runner.created_by
                        ? t("runners.createdBy", { name: runner.created_by })
                        : t("runners.createdAt")}
                      {created && ` · ${created}`}
                    </span>
                  )}
                </div>
                {Boolean(runner.labels?.length) && (
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
                )}
              </td>
              <td className="px-3 py-3 align-top">
                <div
                  className="truncate text-sm"
                  title={runner.owner_project ?? undefined}
                >
                  {owner ?? "—"}
                </div>
                {projects.some((project) => project !== owner) && (
                  <div
                    className="truncate text-muted"
                    title={projects.join(", ")}
                  >
                    {projects.join(", ")}
                  </div>
                )}
              </td>
              {hasActions && (
                <td
                  className={cn(
                    "sticky right-0 z-[1] bg-surface px-2 py-2.5 align-top",
                    selected && "bg-surface-active",
                  )}
                >
                  <div className="flex items-center justify-end gap-0.5">
                    <PlatformOpenButton
                      url={runnerPlatformUrl(source, runner.web_url)}
                      host={source.host}
                      label={t("tasks.openRemote")}
                    />
                    {canManage(item) && (
                      <RunnerActions
                        compact
                        bindingId={source.id}
                        host={source.host}
                        runner={runner}
                        onChanged={(action) =>
                          onManaged(item, action === "delete")
                        }
                      />
                    )}
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
