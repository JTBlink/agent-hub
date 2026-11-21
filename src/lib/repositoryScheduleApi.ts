import { invoke } from "@tauri-apps/api/core";

export interface ScheduleRule {
  cron: string;
  timezone: string | null;
}

export interface RepositorySchedule {
  id: string;
  title: string;
  rules: ScheduleRule[];
  target: string | null;
  active: boolean | null;
  last_status: string | null;
  last_run_id?: number | null;
  last_run_url: string | null;
  next_run_at: string | null;
  owner: string | null;
  url: string;
}

export interface RepositorySchedules {
  items: RepositorySchedule[];
  limited: boolean;
}

export const getRepositorySchedules = (bindingId: string, requestId: string) =>
  invoke<RepositorySchedules>("task_schedules", { bindingId, requestId });

export interface ScheduleProgress {
  total: number;
  finished: number;
  running: number;
  waiting: number;
  status: string | null;
  limited: boolean;
}

export const getScheduleProgress = (
  bindingId: string,
  runId: number,
  requestId: string,
) =>
  invoke<ScheduleProgress>("task_schedule_progress", {
    bindingId,
    runId,
    requestId,
  });
