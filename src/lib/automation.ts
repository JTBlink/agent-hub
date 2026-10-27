import type { TFunction } from "i18next";
import type { AutomationTask } from "./tauri";

export type AutomationSourceFilter = "all" | "system" | "hermes";

export function filterAutomationTasks(
  tasks: AutomationTask[],
  query: string,
  source: AutomationSourceFilter,
  status: string,
  hideBuiltin = true,
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
  if (!schedule) return task.schedule || t("automation.unknown");
  if (schedule.kind === "manual") return t("automation.schedules.manual");
  if (schedule.kind === "custom") return schedule.expression;
  if (schedule.kind === "interval")
    return t("automation.everyMinutes", { count: schedule.minutes });
  return `${t(schedule.weekdays ? "automation.schedules.weekdays" : "automation.schedules.daily")} ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
}
