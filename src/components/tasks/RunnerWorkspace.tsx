import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Server } from "lucide-react";
import type { Project, TaskBinding } from "../../lib/tauri";
import { taskTime } from "../../lib/taskTime";
import { HelpTooltip } from "../HelpTooltip";
import { RepositoryPlatformIcon } from "../RepositoryPlatformIcon";
import { ThemedSelect } from "../ThemedSelect";
import { ToggleSwitch } from "../ToggleSwitch";
import { RunnerDetails } from "./RunnerDetails";
import {
  getRunnerConnectionStates,
  matchesRunnerFilter,
  type RunnerFilter,
  runnerTimeAgo,
  runnerReference,
  runnerStateLabel,
  runnerWork,
} from "./runnerStatus";
import {
  TaskScopeToolbar,
  type TaskScopeToolbarProps,
} from "./TaskScopeToolbar";
import {
  useRepositoryRunners,
  type VisibleRunner,
} from "./useRepositoryRunners";
import { cn } from "../../utils";

export function RunnerWorkspace({
  bindings,
  projects,
  title,
  discovering,
  notice,
  refreshKey,
  scopeKey,
  toolbar,
}: {
  bindings: TaskBinding[];
  projects: Project[];
  title: ReactNode;
  discovering: boolean;
  notice?: ReactNode;
  refreshKey: number;
  scopeKey: string;
  toolbar: Omit<
    TaskScopeToolbarProps,
    "identities" | "leading" | "loading" | "children"
  >;
}) {
  const { t, i18n } = useTranslation();
  const relativeTime = new Intl.RelativeTimeFormat(i18n?.language, {
    numeric: "auto",
  });
  const detailsId = useId();
  const detailsTrigger = useRef<HTMLButtonElement | null>(null);
  const closeDetails = () => {
    setSelection(null);
    if (detailsTrigger.current?.isConnected) detailsTrigger.current.focus();
  };
  const [status, setStatus] = useState<RunnerFilter>("all");
  const [query, setQuery] = useState("");
  const [os, setOs] = useState("all");
  const [tag, setTag] = useState<string | null>(null);
  const [selection, setSelection] = useState<{
    scopeKey: string;
    item: VisibleRunner;
    bindings: TaskBinding[];
  } | null>(null);
  const [auto, setAuto] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(0);
  const { items, sources, loading, updatedAt } = useRepositoryRunners(
    bindings,
    refreshKey + autoRefresh,
  );
  useEffect(() => {
    if (!auto || loading || discovering || !bindings.length) return;
    const timer = window.setTimeout(
      () => setAutoRefresh((value) => value + 1),
      30_000,
    );
    return () => window.clearTimeout(timer);
  }, [auto, loading, discovering, bindings.length, autoRefresh, refreshKey]);
  const selected =
    selection?.scopeKey === scopeKey && selection.bindings === bindings
      ? selection.item
      : null;
  if (selection && !selected) setSelection(null);
  const osChoices = [
    ...new Set(items.flatMap(({ runner }) => (runner.os ? [runner.os] : []))),
    ...(os !== "all" && os !== "unknown" ? [os] : []),
  ]
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort();
  const connectionStates = getRunnerConnectionStates(
    items.map(({ runner }) => runner.state),
    status,
  );
  const filters: RunnerFilter[] = [
    "all",
    ...connectionStates.map((state): RunnerFilter => `state:${state}`),
    "paused",
  ];
  const normalized = query.trim().toLowerCase();
  const hasSystem = items.some(({ runner }) => runner.os);
  const hasWork = items.some(
    ({ runner }) => runner.busy != null || runner.job_status,
  );
  const hasPause = items.some(({ runner }) => runner.paused != null);
  const availableTags = new Set(
    items.flatMap(({ runner }) => runner.labels ?? []),
  );
  const hasTags = availableTags.size > 0;
  const tagChoices = [
    ...new Set([...availableTags, ...(tag === null ? [] : [tag])]),
  ].sort((left, right) => left.localeCompare(right));
  const hasOwner = items.some(({ runner }) => runner.owner_project);
  const hasContact = items.some(({ runner }) => runner.contacted_at);
  const hasCreation = items.some(({ runner }) => runner.created_at);
  const columns = [
    "machine",
    "connection",
    hasWork ? "work" : hasPause ? "pauseStatus" : null,
    hasSystem ? "systemScope" : "scope",
    "projects",
    hasTags ? "labels" : hasOwner ? "owner" : null,
    hasContact ? "contacted" : hasCreation ? "createdAt" : null,
  ].filter(Boolean);
  const visible = items
    .filter((item) => {
      const {
        runner,
        bindings: [source],
      } = item;
      return (
        matchesRunnerFilter(item.runner, status) &&
        (tag === null || runner.labels?.includes(tag)) &&
        (os === "all" ||
          runner.os === os ||
          (os === "unknown" && runner.os === null)) &&
        [
          runner.name,
          source.host,
          String(runner.id),
          runnerReference(runner),
          runner.created_by ?? "",
          ...(runner.labels ?? []),
        ].some((value) => value.toLowerCase().includes(normalized))
      );
    })
    .sort(
      (left, right) =>
        connectionStates.indexOf(left.runner.state) -
        connectionStates.indexOf(right.runner.state),
    );
  const names = (item: VisibleRunner) => [
    ...new Set(
      item.bindings.map(
        (binding) =>
          projects.find((project) => project.id === binding.project_id)?.name ??
          binding.repository,
      ),
    ),
  ];
  const failures = sources.filter((source) => source.error);
  const unknown = t("runners.unknown");
  return (
    <>
      <TaskScopeToolbar
        {...toolbar}
        leading={title}
        loading={discovering || loading}
        identities={[
          ...new Set(
            sources.flatMap(({ inventory, binding }) =>
              inventory?.identity
                ? [`${binding.host} · ${inventory.identity}`]
                : [],
            ),
          ),
        ]}
      />
      {notice}
      {bindings.some((binding) => binding.provider === "github") && (
        <div className="mb-2 text-muted">
          <HelpTooltip
            label={t("runners.githubScope")}
            triggerContent={
              <span className="whitespace-nowrap text-xs">
                {t("runners.githubScope")}
              </span>
            }
          >
            {t("runners.githubScopeDescription")}
          </HelpTooltip>
        </div>
      )}
      {failures.map(({ binding, error }) => (
        <p key={binding.id} role="alert" className="mb-2 text-xs text-warning">
          {binding.host}/{binding.repository} ·{" "}
          {t(`tasks.errors.${error?.kind}`, {
            defaultValue: t("common.error"),
          })}{" "}
          · {error?.message}
        </p>
      ))}
      {sources.some((source) => source.inventory?.limited) && (
        <p role="status" className="mb-2 text-xs text-warning">
          {t("runners.limited")}
        </p>
      )}
      {(discovering || loading) && (
        <p role="status" className="mb-2 text-xs text-muted">
          {t("common.loading")}
        </p>
      )}
      {!discovering && !bindings.length ? (
        <div className="app-panel flex flex-col items-center gap-3 px-4 py-12 text-center text-sm">
          <Server aria-hidden="true" className="text-muted" />
          <p>
            {t(
              toolbar.provider === "all"
                ? "tasks.notConnected"
                : "runners.platformEmpty",
            )}
          </p>
          <button
            type="button"
            className="app-button-secondary"
            onClick={() =>
              toolbar.provider === "all"
                ? toolbar.onConnections()
                : toolbar.onProvider("all")
            }
          >
            {t(
              toolbar.provider === "all"
                ? "tasks.connections"
                : "tasks.allProviders",
            )}
          </button>
        </div>
      ) : (
        <>
          <div className="app-panel mb-3 grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
            {(["all", "state:online", "state:offline", "paused"] as const).map(
              (state) => (
                <div key={state}>
                  <div className="text-xs text-muted">
                    {t(
                      state === "all"
                        ? "runners.visible"
                        : `runners.${state.replace("state:", "")}`,
                    )}
                  </div>
                  <strong className="text-lg tabular-nums">
                    {sources.some((source) => source.inventory)
                      ? items.filter((item) =>
                          matchesRunnerFilter(item.runner, state),
                        ).length
                      : "—"}
                  </strong>
                </div>
              ),
            )}
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label={t("runners.connection")}
              className="flex flex-wrap gap-1"
            >
              {filters.map((state) => (
                <button
                  type="button"
                  key={state}
                  aria-pressed={status === state}
                  onClick={() => setStatus(state)}
                  className={cn(
                    "app-button-ghost gap-1 text-xs",
                    status === state && "bg-surface-active text-accent",
                  )}
                >
                  {state === "all" || state === "paused"
                    ? t(`runners.${state}`)
                    : runnerStateLabel(state.slice("state:".length), t)}{" "}
                  <span className="tabular-nums text-muted">
                    {
                      items.filter((item) =>
                        matchesRunnerFilter(item.runner, state),
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
            <input
              className="app-input h-7 min-w-32 flex-1 text-xs"
              aria-label={t("runners.search")}
              placeholder={t("runners.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {tagChoices.length > 0 && (
              <ThemedSelect
                className="h-7 max-w-48 gap-2 py-0 text-xs"
                aria-label={t("runners.labels")}
                value={tag === null ? "all" : `tag:${tag}`}
                onChange={(event) => {
                  const value = event.target.value;
                  setTag(value === "all" ? null : value.slice("tag:".length));
                }}
              >
                <option value="all">{t("runners.allTags")}</option>
                {tagChoices.map((value) => (
                  <option key={value} value={`tag:${value}`}>
                    {value}
                  </option>
                ))}
              </ThemedSelect>
            )}
            <ThemedSelect
              className="h-7 gap-2 py-0 text-xs"
              aria-label={t("runners.os")}
              value={os}
              onChange={(event) => setOs(event.target.value)}
            >
              <option value="all">{t("runners.allSystems")}</option>
              {osChoices.map((value) => (
                <option key={value}>{value}</option>
              ))}
              <option value="unknown">{unknown}</option>
            </ThemedSelect>
          </div>
          <div
            className="flex min-h-0 flex-1 gap-3"
            onKeyDown={(event) => {
              if (selected && event.key === "Escape") {
                event.preventDefault();
                closeDetails();
              }
            }}
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="app-panel min-h-0 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-secondary text-muted">
                    <tr>
                      {columns.map((field) => (
                        <th
                          key={field}
                          scope="col"
                          className="whitespace-nowrap px-3 py-2 font-medium"
                        >
                          {t(`runners.${field}`)}
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
                      const createdAgo = runnerTimeAgo(
                        runner.created_at,
                        relativeTime,
                      );
                      const configuration = [
                        runner.version &&
                          `${t("runners.version")} ${runner.version}`,
                        runner.locked && t("runners.locked"),
                        runner.project_count != null &&
                          `${t("runners.projectCount")} ${runner.project_count}`,
                        runner.manager_address,
                        hasTags &&
                          runner.owner_project &&
                          `${t("runners.owner")} ${runner.owner_project}`,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      const lastContact = hasContact
                        ? runner.contacted_at
                        : runner.created_at;
                      return (
                        <tr
                          key={item.key}
                          className={cn(
                            "border-t border-border-subtle hover:bg-surface-hover",
                            selected?.key === item.key && "bg-surface-active",
                          )}
                        >
                          <td className="min-w-40 px-3 py-2">
                            <button
                              type="button"
                              aria-expanded={selected?.key === item.key}
                              aria-controls={
                                selected?.key === item.key
                                  ? detailsId
                                  : undefined
                              }
                              onClick={(event) => {
                                detailsTrigger.current = event.currentTarget;
                                setSelection({ scopeKey, item, bindings });
                              }}
                              className="flex max-w-full items-center gap-2 rounded text-left hover:text-accent focus-visible:outline focus-visible:outline-accent"
                            >
                              <RepositoryPlatformIcon
                                providers={[source.provider]}
                                fallbackLabel={t("tasks.provider")}
                              />
                              <span className="min-w-0 break-words">
                                <span className="block text-sm font-medium">
                                  {runner.name}
                                </span>
                                <small className="block text-xs text-muted">
                                  {source.host} · {runnerReference(runner)}
                                </small>
                                {configuration && (
                                  <small className="block text-xs text-muted">
                                    {configuration}
                                  </small>
                                )}
                                {(runner.created_by || createdAgo) && (
                                  <small
                                    className="block text-xs text-muted"
                                    title={
                                      runner.created_at
                                        ? taskTime(runner.created_at)
                                        : undefined
                                    }
                                  >
                                    {runner.created_by
                                      ? t("runners.createdBy", {
                                          name: runner.created_by,
                                        })
                                      : t("runners.createdAt")}
                                    {createdAgo && ` · ${createdAgo}`}
                                  </small>
                                )}
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
                              <small className="block text-xs text-warning">
                                {t("runners.paused")}
                              </small>
                            )}
                          </td>
                          {(hasWork || hasPause) && (
                            <td className="whitespace-nowrap px-3 py-2">
                              {hasWork
                                ? runnerWork(runner, t)
                                : runner.paused == null
                                  ? "—"
                                  : t(
                                      runner.paused
                                        ? "runners.yes"
                                        : "runners.no",
                                    )}
                            </td>
                          )}
                          <td className="whitespace-nowrap px-3 py-2">
                            {hasSystem && (runner.os ?? "—")}
                            <span
                              className={
                                hasSystem
                                  ? "block text-xs text-muted"
                                  : undefined
                              }
                            >
                              {runner.scope
                                ? t(`runners.${runner.scope}`)
                                : "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {names(item).join(", ")}
                          </td>
                          {(hasTags || hasOwner) && (
                            <td className="px-3 py-2">
                              {hasTags && runner.labels?.length ? (
                                <div className="flex flex-wrap gap-1">
                                  {runner.labels.map((label) => (
                                    <button
                                      key={label}
                                      type="button"
                                      aria-pressed={tag === label}
                                      className={cn(
                                        "max-w-full break-words rounded bg-surface-hover px-1.5 py-px text-xs text-secondary hover:text-accent focus-visible:outline focus-visible:outline-accent",
                                        tag === label && "text-accent",
                                      )}
                                      onClick={() =>
                                        setTag(tag === label ? null : label)
                                      }
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                ((hasTags ? null : runner.owner_project) ?? "—")
                              )}
                            </td>
                          )}
                          {(hasContact || hasCreation) && (
                            <td
                              className="whitespace-nowrap px-3 py-2"
                              title={
                                lastContact ? taskTime(lastContact) : undefined
                              }
                            >
                              {runnerTimeAgo(lastContact, relativeTime) || "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!visible.length &&
                  !loading &&
                  !discovering &&
                  (!failures.length ||
                    items.length > 0 ||
                    sources.some((source) => source.inventory)) && (
                    <div className="space-y-3 p-8 text-center text-sm text-muted">
                      <p>
                        {t(
                          items.length
                            ? "runners.noMatch"
                            : failures.length
                              ? "runners.partialEmpty"
                              : "runners.empty",
                        )}
                      </p>
                      {items.length > 0 && (
                        <button
                          type="button"
                          className="app-button-secondary"
                          onClick={() => {
                            setQuery("");
                            setOs("all");
                            setTag(null);
                            setStatus("all");
                          }}
                        >
                          {t("tasks.clearFilters")}
                        </button>
                      )}
                    </div>
                  )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3 pt-2 text-xs text-muted">
                {updatedAt && (
                  <span>
                    {t("runners.updated", {
                      time: updatedAt.toLocaleTimeString(),
                    })}
                  </span>
                )}
                <span className="inline-flex items-center gap-2">
                  <ToggleSwitch
                    checked={auto}
                    onChange={() => setAuto((value) => !value)}
                    title={t("runners.autoRefresh")}
                  />
                  {t("runners.autoRefresh")}
                </span>
              </div>
            </div>
            {selected && (
              <RunnerDetails
                key={selected.key}
                id={detailsId}
                item={selected}
                projects={names(selected)}
                onClose={closeDetails}
                onInventoryChanged={() => setAutoRefresh((value) => value + 1)}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
