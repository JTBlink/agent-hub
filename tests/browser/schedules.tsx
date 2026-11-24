// Synthetic fixture: Vite /tests/browser/schedules.html?theme=light&size=large.
// Play runs only the in-memory mock; no platform request or pipeline is created.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { i18nReady } from "../../src/i18n";
import type {
  RepositorySchedule,
  TaskBinding,
  ScheduleConfig,
} from "../../src/lib/tauri";
import { SchedulesWorkspace } from "../../src/components/tasks/SchedulesWorkspace";
import { applyTextSize } from "../../src/lib/textScale";
import "../../src/index.css";

// Keep polling observable in a background acceptance tab.
Object.defineProperty(document, "visibilityState", { get: () => "visible" });
const params = new URLSearchParams(location.search);
await i18nReady;
document.documentElement.classList.toggle(
  "dark",
  params.get("theme") !== "light",
);
applyTextSize(params.get("size") ?? "default");
const bindings: TaskBinding[] = [
  {
    id: "demo",
    project_id: "demo",
    provider: "gitlab",
    host: "code.example.invalid",
    repository: "team/demo",
    launcher: null,
  },
];
const items: RepositorySchedule[] = [
  {
    id: "75",
    title: "每日 00:00 代码仓库审计（dev，有新提交才运行）",
    rules: [{ cron: "0 0 * * *", timezone: "Asia/Shanghai" }],
    target: "dev",
    active: true,
    last_status: "running",
    last_run_id: 450,
    last_run_url: "https://code.example.invalid/team/demo/-/pipelines/450",
    next_run_at: "2026-11-23T00:00:00+08:00",
    owner: "Demo owner",
    url: "https://code.example.invalid/team/demo/-/pipeline_schedules",
  },
  {
    id: "76",
    title: "每周版本检查",
    rules: [{ cron: "0 9 * * 0", timezone: "Asia/Shanghai" }],
    target: "main",
    active: true,
    last_status: "success",
    last_run_id: null,
    last_run_url: null,
    next_run_at: "2026-11-29T09:00:00+08:00",
    owner: "Demo owner",
    url: "https://code.example.invalid/team/demo/-/pipeline_schedules",
  },
  {
    id: "77",
    title:
      "Daily full regression tests and report with a deliberately long schedule description",
    rules: [{ cron: "0 1 * * *", timezone: "Asia/Shanghai" }],
    target: "feature/a-long-branch-name",
    active: true,
    last_status: "failed",
    last_run_id: null,
    last_run_url: null,
    next_run_at: "2026-11-23T01:00:00+08:00",
    owner: "Demo contributor",
    url: "https://code.example.invalid/team/demo/-/pipeline_schedules",
  },
  {
    id: "78",
    title: "工作日检查",
    rules: [{ cron: "0 6-22/3 * * 1-6", timezone: "Asia/Shanghai" }],
    target: "dev",
    active: false,
    last_status: "canceled",
    last_run_id: null,
    last_run_url: null,
    next_run_at: null,
    owner: null,
    url: "https://code.example.invalid/team/demo/-/pipeline_schedules",
  },
];
const configs = new Map(
  items.map((item) => [
    item.id,
    {
      title: item.title,
      target: `refs/heads/${item.target ?? "main"}`,
      cron: item.rules[0].cron,
      timezone: item.rules[0].timezone ?? "UTC",
      active: item.active ?? false,
    },
  ]),
);
Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke: async (
      command: string,
      args?: { scheduleId?: number; edit?: Partial<ScheduleConfig> },
    ) => {
      if (command === "task_schedules") return { items, limited: false };
      if (command === "task_schedule_progress")
        return {
          total: 6,
          finished: 4,
          running: 1,
          waiting: 1,
          status: "running",
          limited: false,
        };
      const id = String(args?.scheduleId);
      if (command === "task_schedule_config") return { ...configs.get(id) };
      if (command === "task_edit_schedule") {
        const config = configs.get(id)!;
        Object.assign(config, args?.edit);
        const item = items.find((item) => item.id === id)!;
        Object.assign(item, {
          title: config.title,
          target: config.target,
          active: config.active,
          rules: [{ cron: config.cron, timezone: config.timezone }],
        });
        return { ...config };
      }
      if (command === "task_delete_schedule") {
        items.splice(
          items.findIndex((item) => item.id === id),
          1,
        );
        return;
      }
      if (command === "task_run_schedule") {
        document.documentElement.dataset.runRequests = String(
          Number(document.documentElement.dataset.runRequests ?? 0) + 1,
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        return;
      }
      return [];
    },
    transformCallback: () => 1,
    unregisterCallback: () => {},
  },
});
export function Preview() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <main className="min-h-screen bg-background p-5 text-primary">
      <SchedulesWorkspace
        bindings={bindings}
        title="流水线计划"
        discovering={false}
        scopeKey="demo"
        refreshKey={refreshKey}
        toolbar={{
          provider: "all",
          connections: false,
          accountRefresh: 0,
          onProvider: () => {},
          onRefresh: () => setRefreshKey((v) => v + 1),
          onConnections: () => {},
          onAccounts: () => {},
        }}
      />
      <Toaster />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
