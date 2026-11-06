import type {
  AutomationOverview,
  AutomationSchedule,
  AutomationTask,
} from "./tauri";

const KEY = "agent-hub:automation-overview:v1";
const MAX_BYTES = 512 * 1024;
const MAX_AGE = 24 * 60 * 60 * 1000;
type TaskSummary = Pick<
  AutomationTask,
  | "id"
  | "name"
  | "source"
  | "origin"
  | "is_builtin"
  | "schedule"
  | "project"
  | "next_run"
  | "last_run"
  | "status"
  | "last_result"
> & { schedule_rule: AutomationSchedule | null };
interface SavedOverview {
  locale: string;
  savedAt: number;
  tasks: TaskSummary[];
  hermes_installed: boolean;
}
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nullableString = (value: unknown) =>
  value === null || typeof value === "string";
function schedule(value: unknown): value is AutomationSchedule | null {
  if (value === null) return true;
  if (!object(value)) return false;
  const integer = (n: unknown, min: number, max: number) =>
    typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
  switch (value.kind) {
    case "manual":
      return true;
    case "custom":
      return typeof value.expression === "string";
    case "interval":
      return integer(value.minutes, 1, 525600);
    case "hourly":
      return integer(value.minute, 0, 59);
    case "daily":
      return (
        integer(value.hour, 0, 23) &&
        integer(value.minute, 0, 59) &&
        typeof value.weekdays === "boolean"
      );
    default:
      return false;
  }
}
function task(value: unknown): value is TaskSummary {
  return (
    object(value) &&
    ["id", "name", "schedule"].every((key) => typeof value[key] === "string") &&
    ["project", "next_run", "last_run", "last_result"].every((key) =>
      nullableString(value[key]),
    ) &&
    typeof value.is_builtin === "boolean" &&
    typeof value.source === "string" &&
    ["launchd", "cron", "systemd", "windows", "hermes"].includes(
      value.source,
    ) &&
    typeof value.origin === "string" &&
    ["agent_hub", "external", "unknown"].includes(value.origin) &&
    typeof value.status === "string" &&
    ["active", "running", "paused", "completed", "error", "unknown"].includes(
      value.status,
    ) &&
    schedule(value.schedule_rule)
  );
}
function read(): SavedOverview[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > MAX_BYTES) return [];
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length > 3) return [];
    return values.filter(
      (value): value is SavedOverview =>
        object(value) &&
        typeof value.locale === "string" &&
        typeof value.savedAt === "number" &&
        Number.isFinite(value.savedAt) &&
        value.savedAt <= Date.now() &&
        Date.now() - value.savedAt < MAX_AGE &&
        typeof value.hermes_installed === "boolean" &&
        Array.isArray(value.tasks) &&
        value.tasks.length <= 1000 &&
        value.tasks.every(task),
    );
  } catch {
    return [];
  }
}

/** Only list fields survive a reload; commands, prompts, files and permissions do not. */
export function readAutomationOverviewSummary(
  locale: string,
): AutomationOverview | null {
  const saved = read().find((entry) => entry.locale === locale);
  if (!saved) return null;
  return {
    hermes_installed: saved.hermes_installed,
    issues: [],
    tasks: saved.tasks.map(({ schedule_rule, ...summary }) => ({
      ...summary,
      identifier: null,
      bundle_id: null,
      icon: null,
      command: null,
      prompt: null,
      location: "",
      revision: null,
      can_edit: false,
      can_run: false,
      definition: schedule_rule
        ? {
            name: summary.name,
            provider: summary.source === "hermes" ? "hermes" : "system",
            content: "",
            workdir: summary.project,
            schedule: schedule_rule,
            enabled: summary.status !== "paused",
          }
        : null,
    })),
  };
}

export function saveAutomationOverviewSummary(
  locale: string,
  data: AutomationOverview,
) {
  // A partial source failure must not replace the last complete list on disk.
  if (data.issues.length || data.tasks.length > 1000) return;
  const entry: SavedOverview = {
    locale,
    savedAt: Date.now(),
    hermes_installed: data.hermes_installed,
    tasks: data.tasks.map((value) => ({
      id: value.id,
      name: value.name,
      source: value.source,
      origin: value.origin,
      is_builtin: value.is_builtin,
      schedule: value.schedule,
      project: value.project,
      next_run: value.next_run,
      last_run: value.last_run,
      status: value.status,
      last_result: value.last_result,
      schedule_rule: value.definition?.schedule ?? null,
    })),
  };
  try {
    const raw = JSON.stringify(
      [entry, ...read().filter((old) => old.locale !== locale)].slice(0, 3),
    );
    if (raw.length <= MAX_BYTES) localStorage.setItem(KEY, raw);
  } catch {
    /* The session cache still works if storage is unavailable or full. */
  }
}

export function clearAutomationOverviewSummary() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Optional local cache. */
  }
}
