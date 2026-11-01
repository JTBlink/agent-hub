import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/tauri";
import type { Project, RepositoryTask, TaskFilters } from "../../lib/tauri";
import { openUrl } from "@tauri-apps/plugin-opener";
import { TaskToolbar } from "./TaskToolbar";
import { TaskListTable } from "./TaskListTable";
import { TaskConnections } from "./TaskConnections";
import { TaskDetails } from "./TaskDetails";
import { useRepositoryTasks } from "./useRepositoryTasks";
import {
  readTaskViewPreferences,
  saveTaskViewPreferences,
} from "../../lib/taskViewPreferences";
import { getAppScale } from "../../lib/textScale";
import { cn } from "../../utils";
import { useActiveWorkspace } from "../../hooks/useActiveWorkspace";
import { WorkspaceFilesContext } from "../../hooks/useWorkspaceFiles";

export function TaskBrowser({ projects }: { projects: Project[] }) {
  const { t } = useTranslation();
  const [bindings, setBindings] = useState<api.TaskBinding[]>([]);
  const [connections, setConnections] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [discovering, setDiscovering] = useState(true);
  const [initial] = useState(readTaskViewPreferences);
  const workspace = useActiveWorkspace(projects);
  const inWorkspace = useContext(WorkspaceFilesContext) !== null;
  const workspaceId = inWorkspace ? workspace.project?.id : undefined;
  const workspaceKey = JSON.stringify([
    workspaceId,
    inWorkspace ? workspace.path : undefined,
  ]);
  const [provider, setProvider] = useState(initial.provider);
  const [projectScope, setProjectScope] = useState({
    workspaceKey,
    projectId: workspaceId ?? initial.projectId,
  });
  const projectId = projectScope.projectId;
  const [filters, setFilters] = useState<TaskFilters>(initial.filters);
  const [search, setSearch] = useState(initial.filters.text);
  const [selection, setSelection] = useState<{
    task: RepositoryTask;
    full: boolean;
  } | null>(null);
  if (projectScope.workspaceKey !== workspaceKey) {
    setProjectScope({
      workspaceKey,
      projectId: workspaceId ?? initial.projectId,
    });
    setSelection(null);
  }
  const returnFocus = useRef<HTMLElement | null>(null);
  const refreshBindings = useCallback(async () => {
    setDiscovering(true);
    try {
      const next = await api.getTaskBindings(true);
      setBindings(next);
      setSettingsError("");
    } finally {
      setDiscovering(false);
    }
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
      })
      .finally(() => {
        if (!disposed) setDiscovering(false);
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
  const activeProjectId =
    projectId === "all" ||
    discovering ||
    projects.some((project) => project.id === projectId)
      ? projectId
      : "all";
  useEffect(() => {
    saveTaskViewPreferences({ provider, projectId: activeProjectId, filters });
  }, [provider, activeProjectId, filters]);
  const selectedBindings = useMemo(
    () =>
      bindings.filter(
        (binding) =>
          (provider === "all" || binding.provider === provider) &&
          (activeProjectId === "all" || binding.project_id === activeProjectId),
      ),
    [bindings, provider, activeProjectId],
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
  const loading = discovering || sources.some((source) => source.loading);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0">
      <TaskToolbar
        provider={provider}
        projectId={activeProjectId}
        projects={projects}
        bindings={bindings}
        identities={[
          ...new Set(
            sources.map(
              (source) =>
                `${source.binding.host} · ${source.identity || t("tasks.checkingIdentity")}`,
            ),
          ),
        ]}
        filters={filters}
        search={search}
        loading={loading}
        connections={connections}
        onProvider={(value) => {
          setProvider(value);
          setSelection(null);
        }}
        onProject={(value) => {
          setProjectScope({ workspaceKey, projectId: value });
          setSelection(null);
        }}
        onFilters={(patch) => {
          setFilters((previous) => ({ ...previous, ...patch }));
          setSelection(null);
        }}
        onSearch={setSearch}
        onRefresh={() =>
          void refreshBindings().catch((error) =>
            setSettingsError(api.taskFailure(error).message),
          )
        }
        onConnections={() => setConnections((value) => !value)}
        onOpenRepository={(binding) =>
          void openUrl(
            `https://${binding.host}/${binding.repository.split("/").map(encodeURIComponent).join("/")}`,
          ).catch((error) => setSettingsError(api.taskFailure(error).message))
        }
      />
      {settingsError && (
        <p role="alert" className="my-3 text-xs text-danger">
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
      {sources
        .filter((source) => source.error)
        .map((source) => (
          <div
            role="alert"
            key={source.binding.id}
            className="my-2 flex flex-wrap items-center gap-2 text-xs text-danger"
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
      <div className="flex min-h-0 flex-1 gap-3">
        <div
          hidden={selection?.full}
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-auto rounded-lg border border-border-subtle [color-scheme:var(--color-scheme)]",
            selection?.full && "hidden",
          )}
        >
          <TaskListTable
            items={items}
            projects={projects}
            selectedKey={selection?.task.key}
            onOpen={open}
            empty={
              loading ? (
                <p role="status">{t("common.loading")}</p>
              ) : settingsError ||
                sources.some(
                  (source) => source.error,
                ) ? null : selectedBindings.length ? (
                t("tasks.empty")
              ) : (
                <div className="mx-auto max-w-md space-y-3">
                  <p>{t("tasks.notConnected")}</p>
                  <button
                    type="button"
                    className="app-button-secondary"
                    onClick={() => setConnections(true)}
                  >
                    {t("tasks.connections")}
                  </button>
                </div>
              )
            }
          />
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
