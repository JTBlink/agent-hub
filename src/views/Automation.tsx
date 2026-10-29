import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Clock3, RefreshCw, Plus, ChevronRight, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAutomationOverview } from "../hooks/useAutomationOverview";
import { AutomationTaskDetail } from "../components/AutomationTaskDetail";
import { AutomationReadFeedback } from "../components/AutomationReadFeedback";
import { AutomationStatusBadge } from "../components/AutomationStatusBadge";
import {
  AutomationToolbar,
  type AutomationOriginFilter,
} from "../components/AutomationToolbar";
import { AutomationOriginBadge } from "../components/AutomationOriginBadge";
import { AutomationEditor } from "../components/AutomationEditor";
import { CardActionMenu } from "../components/CardActionMenu";
import { AutomationTaskActions } from "../components/AutomationTaskActions";
import { AutomationRemoveDialog } from "../components/AutomationRemoveDialog";
import {
  getProjects,
  type Project,
  saveAutomation,
  runAutomation,
  removeAutomation,
  type AutomationTask,
  type AutomationDraft,
} from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { AutomationTaskIcon } from "../components/AutomationTaskIcon";
import {
  automationProjectName,
  automationTime,
  automationSchedule,
  filterAutomationTasks,
  type AutomationSourceFilter,
} from "../lib/automation";
import { cn } from "../utils";

const columns = [
  "name",
  "schedule",
  "project",
  "host",
  "nextRun",
  "lastRun",
  "status",
  "source",
] as const;

export function Automation() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, loading, error, refresh, generation } = useAutomationOverview(
    i18n.resolvedLanguage ?? i18n.language,
  );
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    let active = true;
    void getProjects().then(
      (value) => {
        if (active) setProjects(value);
      },
      () => {
        /* Directory names remain available when the project list cannot be read. */
      },
    );
    return () => {
      active = false;
    };
  }, [generation]);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<AutomationSourceFilter>("all");
  const [status, setStatus] = useState("all");
  const [hideBuiltin, setHideBuiltin] = useState(true);
  const [origin, setOrigin] = useState<AutomationOriginFilter>("agent_hub");
  const [editor, setEditor] = useState<
    AutomationTask | "create" | "restore" | null
  >(null);
  const [removing, setRemoving] = useState<AutomationTask | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const pending = useRef(false);
  const selectedId = params.get("task");
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const previousTask = useRef(selectedId);
  useEffect(() => {
    const previous = previousTask.current;
    previousTask.current = selectedId;
    if (!selectedId && previous) {
      const button = [
        ...(list.current?.querySelectorAll<HTMLButtonElement>(
          "button[data-automation-id]",
        ) ?? []),
      ].find((node) => node.dataset.automationId === previous);
      if (button) button.focus();
      else search.current?.focus();
    }
  }, [selectedId]);
  const openTask = (id: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set("task", id);
        return next;
      },
      { state: { automationList: true } },
    );
  const backToList = () => {
    const state: unknown = location.state;
    if (
      state &&
      typeof state === "object" &&
      "automationList" in state &&
      state.automationList === true
    ) {
      navigate(-1);
    } else {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete("task");
          return next;
        },
        { replace: true },
      );
    }
  };
  const currentSource =
    source === "hermes" && !data?.hermes_installed ? "all" : source;
  const baseTasks = filterAutomationTasks(
    data?.tasks ?? [],
    query,
    currentSource,
    status,
    hideBuiltin,
    projects,
  );
  const tasks = baseTasks.filter(
    (task) => origin === "all" || task.origin === origin,
  );
  const hiddenCount = hideBuiltin
    ? filterAutomationTasks(
        data?.tasks ?? [],
        query,
        currentSource,
        status,
        false,
        projects,
      ).filter(
        (task) =>
          task.is_builtin && (origin === "all" || task.origin === origin),
      ).length
    : 0;
  const selected = data?.tasks.find((task) => task.id === selectedId);
  const unknown = t("automation.unknown");
  const emptyMessage = loading
    ? "common.loading"
    : !data?.tasks.length && (error !== null || !!data?.issues.length)
      ? "automation.loadFailed"
      : data?.tasks.length
        ? "automation.noMatches"
        : "automation.empty";
  const perform = async (
    task: AutomationTask,
    action: () => Promise<unknown>,
    message?: string,
  ) => {
    if (pending.current) return false;
    pending.current = true;
    setBusyId(task.id);
    setActionError(null);
    setNotice(null);
    try {
      await action();
      if (message) setNotice(message);
      refresh();
      return true;
    } catch (cause) {
      setActionError(getErrorMessage(cause, t("automation.actionFailed")));
      return false;
    } finally {
      pending.current = false;
      setBusyId(null);
    }
  };
  const run = (task: AutomationTask) => {
    void perform(
      task,
      () => runAutomation(task.id),
      t("automation.runRequested"),
    );
  };
  const toggle = (task: AutomationTask) => {
    const definition = task.definition;
    if (definition)
      void perform(task, () =>
        saveAutomation(task.id, task.revision, {
          ...definition,
          enabled: !definition.enabled,
        }),
      );
  };
  const save = async (draft: AutomationDraft) => {
    const task = typeof editor === "object" ? editor : null;
    const id = await saveAutomation(
      task?.id ?? null,
      task?.revision ?? null,
      draft,
    );
    setEditor(null);
    setActionError(null);
    setNotice(t("automation.saved"));
    refresh();
    if (selectedId !== id) openTask(id);
  };
  const feedback = (
    <>
      <AutomationReadFeedback error={error} issues={data?.issues ?? []} />
      {actionError && !removing && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-bg p-3 text-[13px] text-danger"
        >
          {actionError}
        </p>
      )}
      {notice && (
        <p role="status" className="text-[13px] text-accent-light">
          {notice}
        </p>
      )}
    </>
  );
  const overlays = (
    <>
      {editor && (
        <AutomationEditor
          key={typeof editor === "string" ? editor : editor.id}
          task={typeof editor === "string" ? undefined : editor}
          restoreBackup={editor === "restore"}
          hermesInstalled={data?.hermes_installed ?? false}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      )}
      {removing && (
        <AutomationRemoveDialog
          task={removing}
          busy={busyId !== null}
          error={actionError}
          onClose={() => setRemoving(null)}
          onConfirm={async (deleteLocalData) => {
            const success = await perform(removing, () =>
              removeAutomation(removing.id, deleteLocalData),
            );
            if (success && selectedId) backToList();
            if (!success) return false;
          }}
        />
      )}
    </>
  );
  const actions = (task: AutomationTask, compact = false) => (
    <AutomationTaskActions
      task={task}
      compact={compact}
      busy={busyId !== null}
      pending={busyId === task.id}
      onRun={() => run(task)}
      onEdit={() => setEditor(task)}
      onToggle={() => toggle(task)}
      onRemove={() => {
        setActionError(null);
        setRemoving(task);
      }}
    />
  );
  if (selectedId)
    return (
      <>
        <AutomationTaskDetail
          refreshKey={generation}
          key={selectedId}
          task={selected}
          projectName={automationProjectName(
            selected?.project ?? null,
            projects,
          )}
          loading={loading}
          readFailed={error !== null || !!data?.issues.length}
          onBack={backToList}
          onRefresh={refresh}
          actions={selected && actions(selected)}
        >
          {feedback}
        </AutomationTaskDetail>
        {overlays}
      </>
    );
  return (
    <div ref={list} className="app-page gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="app-page-title">{t("automation.title")}</h1>
          <p className="app-page-subtitle">{t("automation.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="app-button-secondary focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RefreshCw
              aria-hidden="true"
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
            {t("automation.refresh")}
          </button>
          <button
            type="button"
            onClick={() => setEditor("create")}
            className="app-button-primary focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t("automation.create")}
          </button>
          <CardActionMenu
            label={t("automation.more")}
            className="[&>button]:h-9 [&>button]:w-9"
            actions={[
              {
                key: "restore",
                label: t("automation.restoreBackup"),
                icon: <RotateCcw className="h-3.5 w-3.5" />,
                onSelect: () => setEditor("restore"),
              },
            ]}
          />
        </div>
      </header>
      <AutomationToolbar
        query={query}
        onQuery={setQuery}
        source={currentSource}
        onSource={setSource}
        status={status}
        onStatus={setStatus}
        origin={origin}
        onOrigin={setOrigin}
        hideBuiltin={hideBuiltin}
        onToggleBuiltin={() => setHideBuiltin((value) => !value)}
        hermesInstalled={data?.hermes_installed ?? false}
        shown={tasks.length}
        hiddenCount={hiddenCount}
        searchRef={search}
      />
      {feedback}
      <div
        aria-busy={loading}
        className="overflow-x-auto rounded-xl border border-border-subtle bg-surface"
      >
        <table className="w-full min-w-[1000px] border-collapse text-left text-[12px]">
          <caption className="sr-only">{t("automation.title")}</caption>
          <thead className="border-b border-border-subtle bg-bg-secondary text-muted">
            <tr>
              {columns.map((key) => (
                <th key={key} scope="col" className="px-4 py-3 font-medium">
                  {t(`automation.columns.${key}`)}
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">{t("automation.details")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {tasks.map((task) => (
              <tr
                key={task.id}
                className="group transition-colors hover:bg-surface-hover"
              >
                <td className="max-w-[240px] px-4 py-4">
                  <button
                    type="button"
                    onClick={() => openTask(task.id)}
                    data-automation-id={task.id}
                    className="flex w-full min-w-0 items-center gap-2.5 text-left text-[13px] font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    title={task.name}
                  >
                    <AutomationTaskIcon task={task} className="h-7 w-7" />
                    <span className="min-w-0">
                      <span className="block truncate">{task.name}</span>
                      {task.origin !== "external" && (
                        <AutomationOriginBadge origin={task.origin} />
                      )}
                    </span>
                  </button>
                </td>
                <td
                  className="max-w-[190px] truncate px-4 py-4 text-tertiary"
                  title={task.schedule}
                >
                  {automationSchedule(task, t)}
                </td>
                <td
                  className="max-w-[130px] truncate px-4 py-4 text-tertiary"
                  title={task.project ?? undefined}
                >
                  {automationProjectName(task.project, projects) || "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-tertiary">
                  {t("automation.localHost")}
                </td>
                <td className="max-w-[170px] px-4 py-4 text-tertiary">
                  {task.definition?.schedule.kind === "manual"
                    ? t("automation.schedules.manual")
                    : task.status === "paused"
                      ? t("automation.states.paused")
                      : automationTime(task.next_run, i18n.language) || unknown}
                </td>
                <td className="max-w-[170px] px-4 py-4 text-tertiary">
                  {automationTime(task.last_run, i18n.language) || unknown}
                  {task.last_result && (
                    <span
                      className={cn(
                        "mt-1 block max-w-[160px] truncate text-[11px]",
                        ["ok", "0"].includes(task.last_result)
                          ? "text-accent-light"
                          : ["skipped", "no_change"].includes(task.last_result)
                            ? "text-muted"
                            : "text-danger",
                      )}
                      title={task.last_result}
                    >
                      {["ok", "0"].includes(task.last_result)
                        ? t("automation.runSucceeded")
                        : task.last_result}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-4">
                  <AutomationStatusBadge status={task.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-tertiary">
                  {t(`automation.sources.${task.source}`)}
                </td>
                <td className="pr-3">
                  <div className="flex items-center justify-end gap-1">
                    {actions(task, true)}
                    <button
                      type="button"
                      onClick={() => openTask(task.id)}
                      aria-label={t("automation.viewTask", { name: task.name })}
                      className="app-button-ghost rounded-md hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent p-1.5"
                    >
                      <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!tasks.length && (
          <div className="flex flex-col items-center gap-3 px-5 py-14 text-center text-muted">
            <Clock3 aria-hidden="true" className="h-7 w-7" />
            <p className="text-sm">{t(emptyMessage)}</p>
          </div>
        )}
      </div>
      <p className="text-[12px] leading-6 text-muted">
        {t("automation.managementNote")}
      </p>
      {overlays}
    </div>
  );
}
