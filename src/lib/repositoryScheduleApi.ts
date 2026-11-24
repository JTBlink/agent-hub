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

export const runRepositorySchedule = (bindingId: string, scheduleId: number) =>
  invoke<void>("task_run_schedule", { bindingId, scheduleId });

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

export interface ScheduleConfig {
  title: string;
  target: string;
  cron: string;
  timezone: string;
  active: boolean;
}
export const getScheduleConfig = (
  bindingId: string,
  scheduleId: number,
  requestId: string,
) =>
  invoke<ScheduleConfig>("task_schedule_config", {
    bindingId,
    scheduleId,
    requestId,
  });
export const editRepositorySchedule = (
  bindingId: string,
  scheduleId: number,
  edit: Partial<ScheduleConfig>,
) =>
  invoke<ScheduleConfig>("task_edit_schedule", { bindingId, scheduleId, edit });
export const deleteRepositorySchedule = (
  bindingId: string,
  scheduleId: number,
) => invoke<void>("task_delete_schedule", { bindingId, scheduleId });
