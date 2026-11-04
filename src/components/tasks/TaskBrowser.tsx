import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { useTranslation } from "react-i18next";
import { Inbox } from "lucide-react";
import * as api from "../../lib/tauri";
import type { Project, RepositoryTask, TaskFilters } from "../../lib/tauri";
import { openUrl } from "@tauri-apps/plugin-opener";
import { TaskToolbar } from "./TaskToolbar";
import { TaskListTable } from "./TaskListTable";
import { TaskConnections } from "./TaskConnections";
import { TaskDetails } from "./TaskDetails";
import type { ReviewAction } from "../../lib/taskReviewActions";
const TaskStartDialog = lazy(() =>
  import("./TaskStartDialog").then((module) => ({
    default: module.TaskStartDialog,
  })),
);
import { useRepositoryTasks } from "./useRepositoryTasks";
import {
  readTaskViewPreferences,
  saveTaskViewPreferences,
} from "../../lib/taskViewPreferences";
import { getAppScale } from "../../lib/textScale";
import { cn } from "../../utils";
import {
  changeTaskFilters,
  defaultTaskFilters,
  serializeTaskFilters,
  taskSearchFilters,
} from "../../lib/taskSearch";
import { useActiveWorkspace } from "../../hooks/useActiveWorkspace";
import { WorkspaceFilesContext } from "../../hooks/useWorkspaceFiles";

export function TaskBrowser({ projects }: { projects: Project[] }) {
  const { t } = useTranslation();
  const [bindings, setBindings] = useState<api.TaskBinding[]>([]);
  const [connections, setConnections] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [discovering, setDiscovering] = useState(true);
  const [initial] = useState(() => {
    const saved = readTaskViewPreferences();
    const filters = taskSearchFilters(saved.filters);
    return {
      ...saved,
      filters: { ...filters, text: serializeTaskFilters(filters) },
    };
  });
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
  const [taskRefresh, setTaskRefresh] = useState(0);
  const [startingTask, setStartingTask] = useState<{
    task: RepositoryTask;
    action?: ReviewAction;
  } | null>(null);
  const startTask = (task: RepositoryTask, action?: ReviewAction) =>
    setStartingTask({ task, action });
  if (projectScope.workspaceKey !== workspaceKey) {
    setProjectScope({
      workspaceKey,
      projectId: workspaceId ?? initial.projectId,
    });
    setSelection(null);
  }
  const returnFocus = useRef<HTMLElement | null>(null);
  const refreshBindings = useCallback(async (recheckIdentity = false) => {
    setDiscovering(true);
    try {
      const next = await api.getTaskBindings(recheckIdentity);
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
  const appliedFilters = useMemo(
    () =>
      taskSearchFilters({
        ...defaultTaskFilters,
        kind: filters.kind,
        state: "all",
        text: filters.text,
      }),
    [filters],
  );
  useEffect(() => {
    saveTaskViewPreferences({
      provider,
      projectId: activeProjectId,
      filters: { ...appliedFilters, text: filters.text },
    });
  }, [provider, activeProjectId, filters.text, appliedFilters]);
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
    appliedFilters,
    taskRefresh,
  );
  const taskUpdated = (task: RepositoryTask) => {
    setSelection((previous) =>
      previous?.task.key === task.key ? { ...previous, task } : previous,
    );
    setTaskRefresh((value) => value + 1);
  };
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
  const openRepository = (
    repository: Pick<api.TaskBinding, "host" | "repository">,
  ) =>
    void openUrl(
      `https://${repository.host}/${repository.repository.split("/").map(encodeURIComponent).join("/")}`,
    ).catch((error) => setSettingsError(api.taskFailure(error).message));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0">
      <TaskToolbar
        provider={provider}
        projectId={activeProjectId}
        projects={projects}
        bindings={bindings}
        identities={[
          ...new Set(
            sources
              .filter((source) => source.identity)
              .map((source) => `${source.binding.host} · ${source.identity}`),
          ),
        ]}
        filters={appliedFilters}
        items={items}
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
          const next = changeTaskFilters(
            {
              ...defaultTaskFilters,
              kind: appliedFilters.kind,
              state: "all",
              text: search,
            },
            patch,
          );
          const text = serializeTaskFilters(next);
          setFilters({ ...next, text });
          setSearch(text);
          setSelection(null);
        }}
        onSearch={setSearch}
        onRefresh={() =>
          void refreshBindings().catch((error) =>
            setSettingsError(api.taskFailure(error).message),
          )
        }
        onConnections={() => setConnections((value) => !value)}
        onOpenRepository={openRepository}
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
          onRefreshIdentity={() => refreshBindings(true)}
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
            onOpenRepository={openRepository}
            onUpdated={taskUpdated}
            onStart={startTask}
            empty={
              loading ? (
                <p role="status">{t("common.loading")}</p>
              ) : settingsError ||
                sources.some(
                  (source) => source.error,
                ) ? null : selectedBindings.length ? (
                <div className="flex flex-col items-center gap-3">
                  <Inbox
                    size={32}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className="text-muted opacity-60"
                  />
                  <p>{t("tasks.empty")}</p>
                </div>
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
            onUpdated={taskUpdated}
            onStart={startTask}
          />
        )}
      </div>
      {startingTask && (
        <Suspense
          fallback={
            <p role="status" className="text-xs text-muted">
              {t("common.loading")}
            </p>
          }
        >
          <TaskStartDialog
            key={`${startingTask.task.key}/${startingTask.action ?? "start"}`}
            task={startingTask.task}
            action={startingTask.action}
            projects={projects}
            onClose={() => setStartingTask(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
