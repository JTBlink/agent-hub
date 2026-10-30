import type { TFunction } from "i18next";
import type {
  AutomationTask,
  AutomationDraft,
  AutomationSchedule,
  Project,
} from "./tauri";

export function automationPromptFile(draft: AutomationDraft) {
  return draft.files?.find(
    (file) => file.path === "prompt.md" || file.path.endsWith("/prompt.md"),
  );
}

export function automationHerdrConfig(draft: AutomationDraft) {
  const file = draft.files?.find(
    (file) => file.path === "herdr.json" || file.path.endsWith("/herdr.json"),
  );
  if (!file) return null;
  try {
    const value: unknown = JSON.parse(file.content);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !("agent" in value) ||
      typeof value.agent !== "string"
    )
      return null;
    return { file, value, agent: value.agent };
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
