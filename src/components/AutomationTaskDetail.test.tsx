// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AutomationTask } from "../lib/tauri";
import zh from "../i18n/zh.json";
import { AutomationTaskDetail } from "./AutomationTaskDetail";

const api = vi.hoisted(() => ({ writeText: vi.fn(), success: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: api.writeText,
}));
vi.mock("sonner", () => ({ toast: { success: api.success, error: vi.fn() } }));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }),
}));

const task: AutomationTask = {
  id: "cron:review",
  name: "代码审查 — 完整标题 #1",
  identifier: null,
  bundle_id: null,
  icon: null,
  source: "cron",
  origin: "external",
  can_edit: false,
  can_run: false,
  definition: null,
  revision: null,
  is_builtin: false,
  schedule: "0 * * * *",
  project: "/workspace/demo",
  status: "unknown",
  next_run: null,
  last_run: null,
  last_result: null,
  command: null,
  prompt: null,
  location: "crontab",
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  api.writeText.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(value: AutomationTask | undefined) {
  await act(async () =>
    root.render(
      <AutomationTaskDetail
        task={value}
        projectName="Demo"
        refreshKey={0}
        loading={false}
        readFailed={false}
        onBack={() => {}}
        onRefresh={() => {}}
      />,
    ),
  );
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="复制任务上下文"]',
  )!;
}

it("copies only the troubleshooting summary for an installed task package", async () => {
  const button = await render({
    ...task,
    source: "launchd",
    origin: "agent_hub",
    is_package: true,
    status: "active",
    identifier: "demo.review",
    last_run: "2026-11-12T07:00:00+08:00",
    last_result: "0",
    command: "sh scripts/review.sh",
    prompt: "Review the queued changes.\nSummarize the findings.",
    definition: {
      name: task.name,
      provider: "system",
      description: "Checks queued changes in the demo project.",
      content: "sh scripts/review.sh",
      workdir: "/workspace/demo",
      script_dir: "/automation/review",
      enabled: true,
      schedule: { kind: "interval", minutes: 10 },
      package_options: { version: "3.5.2", dependencies: [] },
      files: [
        {
          path: "config/prompt-variants.json",
          content: JSON.stringify({
            version: 2,
            active_id: "review",
            variants: [
              { id: "review", name: "Review" },
              { id: "other", name: "Other", content: "Inactive prompt" },
            ],
          }),
        },
        { path: "scripts/review.sh", content: "Script contents" },
      ],
    },
  });
  expect(button.previousElementSibling?.tagName).toBe("H1");
  expect(button.querySelector(".lucide-copy")).not.toBeNull();
  await act(async () => button.click());
  expect(api.writeText).toHaveBeenCalledOnce();
  const [[context]] = api.writeText.mock.calls;
  expect(context).toBe(
    [
      `# ${task.name}`,
      "",
      "- 任务 ID: cron:review",
      "- 项目工作区: /workspace/demo",
      "- 脚本目录: /automation/review",
      "- 任务版本: 3.5.2",
      "- 状态: 已启用",
      "- 日程: 每 10 分钟",
      "- 最近运行: 2026-11-12T07:00:00+08:00",
      "- 最近结果: 执行成功",
      "- 当前使用: Review",
    ].join("\n"),
  );
  expect(api.success).toHaveBeenCalledWith("任务上下文已复制");

  const other = await render({
    ...task,
    id: "cron:other",
    name: "另一任务",
    command: "sh ./check.sh",
  });
  await act(async () => other.click());
  const [, [otherContext]] = api.writeText.mock.calls;
  expect(otherContext).toContain("# 另一任务");
  expect(otherContext).toContain("- 日程: 0 * * * *");
  expect(otherContext).toContain("    sh ./check.sh");
  expect(otherContext).not.toContain("未知");
  expect(otherContext).not.toContain("Review the queued changes.");
});

it("disables context copying when the task is unavailable", async () => {
  const button = await render(undefined);
  expect(button.disabled).toBe(true);
  await act(async () => button.click());
  expect(api.writeText).not.toHaveBeenCalled();
});

it("explains an enabled launchd interval when the system exposes no next timestamp", async () => {
  await render({
    ...task,
    source: "launchd",
    status: "active",
    can_run: true,
    definition: {
      name: task.name,
      provider: "system",
      content: "pwd",
      workdir: null,
      enabled: true,
      schedule: { kind: "interval", minutes: 10 },
    },
  });
  const metric = [...container.querySelectorAll("dt")].find(
    (label) => label.textContent === "下次运行",
  )!;
  expect(metric.nextElementSibling?.textContent).toBe(
    "由系统调度（每 10 分钟）",
  );
});

it("retains paused, manual and unavailable states and prefers a provided next timestamp", async () => {
  const scheduled: AutomationTask = {
    ...task,
    source: "launchd",
    status: "active",
    is_package: true,
    can_run: true,
    definition: {
      name: task.name,
      provider: "system",
      content: "pwd",
      workdir: null,
      enabled: true,
      schedule: { kind: "interval", minutes: 10 },
    },
  };
  const next = () =>
    [...container.querySelectorAll("dt")].find(
      (label) => label.textContent === "下次运行",
    )!.nextElementSibling?.textContent;
  await render({ ...scheduled, status: "paused" });
  expect(next()).toBe("已停用");
  await render({ ...scheduled, can_run: false });
  expect(next()).toBe("未知");
  await render({ ...scheduled, status: "unknown" });
  expect(next()).toBe("未知");
  await render({ ...scheduled, source: "systemd" });
  expect(next()).toBe("未知");
  const timestamp = "2026-11-12T07:00:00+08:00";
  await render({ ...scheduled, next_run: timestamp });
  expect(next()).toBe(new Date(timestamp).toLocaleString("zh"));
  await render({
    ...scheduled,
    definition: { ...scheduled.definition!, schedule: { kind: "manual" } },
  });
  expect(next()).toBe("仅手动触发");
});
