import type { TFunction } from "i18next";
import type {
  AutomationTask,
  AutomationDraft,
  AutomationSchedule,
  Project,
} from "./tauri";

export function automationPromptFile(draft: AutomationDraft) {
  return (
    draft.files?.find((file) => file.path === "prompts/prompt.md") ??
    draft.files?.find(
      (file) => file.path === "prompt.md" || file.path.endsWith("/prompt.md"),
    )
  );
}

export type AutomationAgentConfig = {
  runner: { kind: string; session: string; title: string };
  launch: { arguments: string[] };
  execution: { wait_timeout_seconds: number; include_task_variables?: boolean };
};

export function automationAgentConfig(draft: AutomationDraft) {
  const file = draft.files?.find(
    (file) =>
      file.path === "config/agent.json" ||
      file.path.endsWith("/config/agent.json"),
  );
  if (!file) return null;
  try {
    const value: unknown = JSON.parse(file.content);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !("runner" in value) ||
      !("launch" in value) ||
      !("execution" in value)
    )
      return null;
    const candidate = value as Record<string, unknown>;
    const runner = candidate.runner;
    const launch = candidate.launch;
    const execution = candidate.execution;
    if (
      !runner ||
      typeof runner !== "object" ||
      Array.isArray(runner) ||
      !launch ||
      typeof launch !== "object" ||
      Array.isArray(launch) ||
      !execution ||
      typeof execution !== "object" ||
      Array.isArray(execution)
    )
      return null;
    const runnerValue = runner as Record<string, unknown>;
    const launchValue = launch as Record<string, unknown>;
    const executionValue = execution as Record<string, unknown>;
    if (
      typeof runnerValue.kind !== "string" ||
      typeof runnerValue.session !== "string" ||
      !runnerValue.session ||
      typeof runnerValue.title !== "string" ||
      !runnerValue.title.trim() ||
      !Array.isArray(launchValue.arguments) ||
      launchValue.arguments.length > 128 ||
      !launchValue.arguments.every(
        (arg) =>
          typeof arg === "string" &&
          arg.length <= 4096 &&
          !/[\0\r\n]/.test(arg),
      ) ||
      typeof executionValue.wait_timeout_seconds !== "number" ||
      !Number.isInteger(executionValue.wait_timeout_seconds) ||
      executionValue.wait_timeout_seconds < 60 ||
      executionValue.wait_timeout_seconds > 7200 ||
      (executionValue.include_task_variables !== undefined &&
        typeof executionValue.include_task_variables !== "boolean")
    )
      return null;
    return {
      file,
      value: value as AutomationAgentConfig,
      agent: runnerValue.kind,
    };
  } catch {
    return null;
  }
}

/** Prefer the registered workspace name; unregistered directories use their final segment. */
export function automationProjectName(
  path: string | null,
  projects: Project[],
) {
  if (!path) return null;
  const normalize = (value: string) =>
    value.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalized = normalize(path);
  return (
    projects.find((project) => normalize(project.path) === normalized)?.name ||
    normalized.split("/").pop() ||
    path
  );
}

export type AutomationSourceFilter = "all" | "system" | "hermes";

export function filterAutomationTasks(
  tasks: AutomationTask[],
  query: string,
  source: AutomationSourceFilter,
  status: string,
  hideBuiltin = true,
  projects: Project[] = [],
) {
  const search = query.trim().toLocaleLowerCase();
  return tasks.filter(
    (task) =>
      (!hideBuiltin || !task.is_builtin) &&
      (source === "all" ||
        (source === "hermes") === (task.source === "hermes")) &&
      (status === "all" || task.status === status) &&
      [
        task.name,
        task.identifier,
        task.bundle_id,
        task.schedule,
        task.project,
        automationProjectName(task.project, projects),
        task.command,
        task.prompt,
        task.source,
        task.location,
      ].some((value) => value?.toLocaleLowerCase().includes(search)),
  );
}

/** Preserve provider text when it is not an ISO timestamp; never invent a date. */
export function automationTime(value: string | null, locale: string) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? value : new Date(time).toLocaleString(locale);
}

/** launchd interval jobs expose a cadence, not an authoritative next timestamp. */
export function automationNextRun(
  task: AutomationTask | undefined,
  locale: string,
  t: TFunction,
): string {
  if (task?.status === "paused" || task?.definition?.enabled === false)
    return t("automation.states.paused");
  if (task?.definition?.schedule.kind === "manual")
    return t("automation.schedules.manual");
  const timestamp = automationTime(task?.next_run ?? null, locale);
  if (timestamp) return timestamp;
  if (
    task?.source === "launchd" &&
    ["active", "running", "error"].includes(task.status) &&
    (!task.is_package || task.can_run) &&
    task.definition?.schedule.kind === "interval" &&
    task.definition.schedule.minutes > 0
  )
    return t("automation.systemScheduledInterval", {
      schedule: automationSchedule(task, t),
    });
  return t("automation.unknown");
}

/** Presentation uses the saved schedule; raw provider text remains searchable. */
export function automationSchedule(task: AutomationTask, t: TFunction): string {
  const schedule = task.definition?.schedule;
  return schedule
    ? formatAutomationSchedule(schedule, t)
    : task.schedule || t("automation.unknown");
}

export function formatAutomationSchedule(
  schedule: AutomationSchedule,
  t: TFunction,
): string {
  if (schedule.kind === "manual") return t("automation.schedules.manual");
  if (schedule.kind === "custom") return schedule.expression;
  if (schedule.kind === "interval")
    return t("automation.everyMinutes", { count: schedule.minutes });
  if (schedule.kind === "hourly")
    return t("automation.hourlyAt", {
      minute: String(schedule.minute).padStart(2, "0"),
    });
  return `${t(schedule.weekdays ? "automation.schedules.weekdays" : "automation.schedules.daily")} ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
}
