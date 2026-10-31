import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, RefreshCw, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/tauri";
import type { Project, RepositoryTask, TaskFilters } from "../../lib/tauri";
import { ThemedSelect } from "../ThemedSelect";
import { TaskConnections } from "./TaskConnections";
import { TaskDetails } from "./TaskDetails";
import { useRepositoryTasks } from "./useRepositoryTasks";
import {
  readTaskViewPreferences,
  saveTaskViewPreferences,
} from "../../lib/taskViewPreferences";
import { getAppScale } from "../../lib/textScale";
import { cn } from "../../utils";

export function TaskBrowser({ projects }: { projects: Project[] }) {
  const { t } = useTranslation();
  const [bindings, setBindings] = useState<api.TaskBinding[]>([]);
  const [connections, setConnections] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [initial] = useState(readTaskViewPreferences);
  const [provider, setProvider] = useState(initial.provider);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [filters, setFilters] = useState<TaskFilters>(initial.filters);
  const [search, setSearch] = useState(initial.filters.text);
  useEffect(() => {
    saveTaskViewPreferences({ provider, projectId, filters });
  }, [provider, projectId, filters]);
  const [selection, setSelection] = useState<{
    task: RepositoryTask;
    full: boolean;
  } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const refreshBindings = useCallback(async () => {
    const next = await api.getTaskBindings();
    setBindings(next);
    setSettingsError("");
  }, []);
  useEffect(() => {
    let disposed = false;
    void api
      .getTaskBindings()
      .then((next) => {
        if (!disposed) setBindings(next);
      })
      .catch((error) => {
        if (!disposed) setSettingsError(api.taskFailure(error).message);
      });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setFilters((previous) =>
          previous.text === search ? previous : { ...previous, text: search },
        ),
      250,
    );
    return () => clearTimeout(timer);
  }, [search]);
  const selectedBindings = useMemo(
    () =>
      bindings.filter(
        (binding) =>
          (provider === "all" || binding.provider === provider) &&
          (projectId === "all" || binding.project_id === projectId),
      ),
    [bindings, provider, projectId],
  );
  const { sources, items, load } = useRepositoryTasks(
    selectedBindings,
    filters,
  );
  const open = (task: RepositoryTask, full: boolean, trigger: HTMLElement) => {
    returnFocus.current = trigger;
    setSelection({
      task,
      full: full || window.innerWidth / getAppScale() < 1200,
    });
  };
  const close = () => {
    setSelection(null);
    requestAnimationFrame(
      () => returnFocus.current?.isConnected && returnFocus.current.focus(),
    );
  };
  const loading = sources.some((source) => source.loading);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="app-page-title">{t("tasks.title")}</h1>
        <button
          type="button"
          className="app-button-secondary"
          aria-label={t("tasks.connections")}
          onClick={() => setConnections((value) => !value)}
        >
          <Settings2 size={14} />
          {t("tasks.connections")}
        </button>
      </div>
      {settingsError && (
        <p role="alert" className="text-xs text-danger">
          {settingsError}
          <button
            type="button"
            onClick={() =>
              void refreshBindings().catch((error) =>
                setSettingsError(api.taskFailure(error).message),
              )
            }
          >
            {t("common.retry")}
          </button>
        </p>
      )}
      {connections && (
        <TaskConnections
          projects={projects}
          bindings={bindings}
          onChanged={refreshBindings}
          onClose={() => setConnections(false)}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ThemedSelect
          aria-label={t("tasks.provider")}
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
        >
          <option value="all">{t("tasks.allProviders")}</option>
          <option value="github">GitHub</option>
          <option value="gitlab">GitLab</option>
        </ThemedSelect>
        <ThemedSelect
          aria-label={t("tasks.project")}
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          <option value="all">{t("tasks.allProjects")}</option>
          {projects.map((project) => (
            <option value={project.id} key={project.id}>
              {project.name}
            </option>
          ))}
        </ThemedSelect>
        <ThemedSelect
          aria-label={t("tasks.kind")}
          value={filters.kind}
          onChange={(event) =>
            setFilters((previous) => ({
              ...previous,
              kind: event.target.value === "review" ? "review" : "issue",
            }))
          }
        >
          <option value="issue">Issues</option>
          <option value="review">PR / MR</option>
        </ThemedSelect>
        <ThemedSelect
          aria-label={t("tasks.state")}
          value={filters.state}
          onChange={(event) =>
            setFilters((previous) => ({
              ...previous,
              state:
                event.target.value === "closed"
                  ? "closed"
                  : event.target.value === "all"
                    ? "all"
                    : "open",
            }))
          }
        >
          <option value="open">{t("tasks.open")}</option>
          <option value="closed">{t("tasks.closed")}</option>
          <option value="all">{t("tasks.allStates")}</option>
        </ThemedSelect>
        <ThemedSelect
          aria-label={t("tasks.personal")}
          value={filters.personal}
          onChange={(event) =>
            setFilters((previous) => ({
              ...previous,
              personal:
                event.target.value === "assigned"
                  ? "assigned"
                  : event.target.value === "created"
                    ? "created"
                    : "all",
            }))
          }
        >
          <option value="all">{t("tasks.everyone")}</option>
          <option value="assigned">{t("tasks.assigned")}</option>
          <option value="created">{t("tasks.created")}</option>
        </ThemedSelect>
        <input
          aria-label={t("tasks.search")}
          className="app-input min-w-32 flex-1"
          value={search}
          placeholder={t("tasks.search")}
          maxLength={256}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button
          type="button"
          className="app-button-ghost"
          aria-label={t("common.refresh")}
          disabled={loading}
          onClick={() =>
            sources.forEach((source) => void load(source.binding, 1))
          }
        >
          <RefreshCw size={15} />
        </button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        {sources.map((source) => (
          <span
            key={source.binding.id}
            title={`${source.binding.host}/${source.binding.repository}`}
          >
            {source.binding.host} ·{" "}
            {source.identity || t("tasks.checkingIdentity")}
          </span>
        ))}
      </div>
      {sources
        .filter((source) => source.error)
        .map((source) => (
          <div
            role="alert"
            key={source.binding.id}
            className="flex flex-wrap items-center gap-2 text-xs text-danger"
          >
            <span>
              {source.binding.repository} ·{" "}
              {t(`tasks.errors.${source.error?.kind}`, {
                defaultValue: t("common.error"),
              })}
              : {source.error?.message}
            </span>
            <button
              type="button"
              className="app-button-ghost"
              disabled={source.loading}
              onClick={() => void load(source.binding, source.nextPage)}
            >
              {t("common.retry")}
            </button>
          </div>
        ))}
      {sources.some((source) => source.limited) && (
        <p className="text-xs text-muted">{t("tasks.limited")}</p>
      )}
      {!bindings.length && !settingsError && (
        <p className="py-12 text-center text-sm text-muted">
          {t("tasks.notConnected")}
        </p>
      )}
      {!!bindings.length &&
        !items.length &&
        !loading &&
        !sources.some((source) => source.error) && (
          <p className="py-12 text-center text-sm text-muted">
            {t("tasks.empty")}
          </p>
        )}
      {loading && (
        <p role="status" className="text-xs text-muted">
          {t("common.loading")}
        </p>
      )}
      <div className="flex min-h-0 flex-1 gap-3">
        <div
          hidden={selection?.full}
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border border-border-subtle",
            selection?.full && "hidden",
          )}
        >
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-bg-secondary text-muted">
              <tr>
                <th className="p-2">{t("tasks.task")}</th>
                <th className="p-2">{t("tasks.project")}</th>
                <th className="p-2">{t("tasks.state")}</th>
                <th className="p-2">{t("tasks.assignee")}</th>
                <th className="p-2">{t("tasks.updated")}</th>
                <th>
                  <span className="sr-only">{t("tasks.preview")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((task) => (
                <tr
                  key={`${task.binding_id}/${task.key}`}
                  className="border-t border-border-subtle hover:bg-surface-hover"
                >
                  <td className="max-w-md p-2">
                    <button
                      type="button"
                      className="text-left"
                      onClick={(event) => open(task, true, event.currentTarget)}
                      onKeyDown={(event) => {
                        if (event.key === " ") {
                          event.preventDefault();
                          open(task, false, event.currentTarget);
                        }
                      }}
                    >
                      <span className="mr-2 text-muted">
                        {task.kind === "review" && task.provider === "gitlab"
                          ? "!"
                          : "#"}
                        {task.number}
                      </span>
                      {task.title}
                    </button>
                  </td>
                  <td
                    className="max-w-40 truncate p-2"
                    title={`${task.host}/${task.repository}`}
                  >
                    {task.repository}
                  </td>
                  <td className="p-2">{task.state}</td>
                  <td className="p-2">{task.assignees.join(", ") || "—"}</td>
                  <td className="whitespace-nowrap p-2">
                    {task.updated_at
                      ? new Date(task.updated_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="p-1">
                    <button
                      type="button"
                      className="app-button-ghost"
                      aria-label={t("tasks.preview")}
                      onClick={(event) =>
                        open(task, false, event.currentTarget)
                      }
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sources.some((source) => source.hasMore) && (
            <button
              type="button"
              disabled={loading}
              className="app-button-secondary m-2"
              onClick={() =>
                sources
                  .filter((source) => source.hasMore)
                  .forEach(
                    (source) => void load(source.binding, source.nextPage),
                  )
              }
            >
              {t("tasks.loadMore")}
            </button>
          )}
        </div>
        {selection && (
          <TaskDetails
            key={`${selection.task.binding_id}/${selection.task.key}`}
            task={selection.task}
            full={selection.full}
            onClose={close}
            onExpand={() => setSelection({ ...selection, full: true })}
          />
        )}
      </div>
    </div>
  );
}
