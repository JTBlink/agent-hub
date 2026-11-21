import type { RepositoryRunner } from "../../lib/taskBrowserApi";

export const runnerConnectionStates = [
  "online",
  "offline",
  "stale",
  "never_contacted",
  "unknown",
] as const;

export function runnerStateLabel(state: string, t: (key: string) => string) {
  return runnerConnectionStates.some((known) => known === state)
    ? t(`runners.${state}`)
    : state;
}

export function runnerReference(runner: RepositoryRunner) {
  return runner.short_id
    ? `#${runner.id} (${runner.short_id})`
    : `#${runner.id}`;
}

export function runnerWork(
  runner: RepositoryRunner,
  t: (key: string) => string,
) {
  if (runner.busy != null)
    return t(runner.busy ? "runners.busy" : "runners.idle");
  return runner.job_status ?? "—";
}

export function runnerTimeAgo(
  createdAt: string | null | undefined,
  formatter: Intl.RelativeTimeFormat,
) {
  if (!createdAt) return "";
  const elapsed = Date.parse(createdAt) - Date.now();
  if (!Number.isFinite(elapsed)) return "";
  const units = [
    ["year", 365 * 86_400_000],
    ["month", 30 * 86_400_000],
    ["week", 7 * 86_400_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ] as const;
  const [unit, milliseconds] = units.find(
    ([, duration]) => Math.abs(elapsed) >= duration,
  ) ?? ["second", 1000];
  return formatter.format(Math.trunc(elapsed / milliseconds), unit);
}
