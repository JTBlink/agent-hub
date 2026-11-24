import type { RepositorySchedule, TaskBinding } from "./tauri";

export function scheduleContext(
  binding: TaskBinding,
  schedule: RepositorySchedule,
  status: string | null = schedule.last_status,
): string {
  return [
    `${binding.provider === "github" ? "GitHub" : "GitLab"} · ${binding.host}/${binding.repository}`,
    `Pipeline schedule #${schedule.id}: ${schedule.title}`,
    schedule.url,
    ...(schedule.target ? [`Ref: ${schedule.target}`] : []),
    ...schedule.rules.map(
      ({ cron, timezone }) =>
        `Cron: ${cron}${timezone ? ` (${timezone})` : ""}`,
    ),
    ...(status ? [`Last run status: ${status}`] : []),
    ...(schedule.last_run_id != null
      ? [`Last run ID: ${schedule.last_run_id}`]
      : []),
    ...(schedule.last_run_url ? [`Last run: ${schedule.last_run_url}`] : []),
  ].join("\n");
}
