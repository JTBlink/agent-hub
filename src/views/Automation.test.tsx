// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../lib/tauri";
import zh from "../i18n/zh.json";
import { MemoryRouter } from "react-router-dom";
import { Automation } from "./Automation";

vi.mock("../lib/tauri", () => ({
  getAutomationOverview: vi.fn(),
  saveAutomation: vi.fn(),
  runAutomation: vi.fn(),
  removeAutomation: vi.fn(),
  getAutomationTemplates: vi.fn(),
  getAutomationBackups: vi.fn(),
  getAutomationOutput: vi.fn(),
  onAutomationChanged: vi.fn(),
}));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }),
}));
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  },
  close: {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  },
});
const native: api.AutomationTask = {
  id: "cron:audit",
  name: "系统备份",
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
  schedule: "0 9 * * 1-5",
  project: "<workspace>",
  status: "unknown",
  next_run: null,
  last_run: null,
  last_result: null,
  command: "/bin/backup",
  prompt: null,
  location: "crontab",
};
const hermes: api.AutomationTask = {
  ...native,
  id: "hermes:audit",
  name: "仓库审计",
  source: "hermes",
  status: "paused",
  prompt: "检查依赖更新和测试失败，汇总建议。",
  command: null,
  location: "~/.hermes/cron/jobs.json",
  can_edit: true,
  can_run: true,
  definition: {
    name: "仓库审计",
    provider: "hermes",
    content: "检查依赖更新和测试失败，汇总建议。",
    workdir: null,
    schedule: { kind: "interval", minutes: 10 },
    enabled: false,
  },
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(api.onAutomationChanged)
    .mockReset()
    .mockResolvedValue(() => {});
  vi.mocked(api.getAutomationOverview)
    .mockReset()
    .mockResolvedValue({
      tasks: [native, hermes],
      issues: [],
      hermes_installed: true,
    });
  vi.mocked(api.saveAutomation).mockReset().mockResolvedValue("created-id");
  vi.mocked(api.runAutomation).mockReset().mockResolvedValue();
  vi.mocked(api.removeAutomation).mockReset().mockResolvedValue();
  vi.mocked(api.getAutomationTemplates)
    .mockReset()
    .mockResolvedValue({
      shell: "sh",
      templates: [
        {
          id: "disk-check",
          title: "磁盘空间检查",
          description: "每小时检查可用空间",
          draft: {
            name: "磁盘空间检查",
            provider: "system",
            content: "df -h .",
            workdir: null,
            schedule: { kind: "interval", minutes: 60 },
            enabled: true,
          },
        },
      ],
    });
  vi.mocked(api.getAutomationBackups).mockReset().mockResolvedValue([]);
  vi.mocked(api.getAutomationOutput).mockReset().mockResolvedValue({
    content: "test output",
    truncated: false,
    available: true,
    kind: "system",
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function render(path = "/automation") {
  await act(async () =>
    root.render(
      <StrictMode>
        <MemoryRouter initialEntries={[path]}>
          <Automation />
        </MemoryRouter>
      </StrictMode>,
    ),
  );
}
function button(name: string) {
  const found = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === name,
  );
  if (!found) throw new Error(`Missing button ${name}`);
  return found;
}
async function click(name: string) {
  await act(async () => button(name).click());
}

it("hides built-in maintenance by default and reveals it with a filter switch", async () => {
  const builtin = {
    ...native,
    id: "launchd:maintenance",
    name: "com.apple.maintenance",
    source: "launchd" as const,
    is_builtin: true,
  };
  vi.mocked(api.getAutomationOverview).mockResolvedValue({
    tasks: [native, hermes, builtin],
    issues: [],
    hermes_installed: true,
  });
  await render();
  const toggle = container.querySelector<HTMLButtonElement>(
    '[role="switch"][aria-label="隐藏系统内置任务"]',
  )!;
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  expect(container.textContent).toContain("已隐藏 1 个系统内置任务");
  await act(async () => toggle.click());
  expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
  expect(container.querySelector("tbody")?.textContent).toContain(
    "com.apple.maintenance",
  );
  await act(async () => toggle.click());
  expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  await select("任务来源", "hermes");
  expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(container.textContent).not.toContain("已隐藏");
  await click("刷新");
  expect(toggle.getAttribute("aria-checked")).toBe("true");
});

it("explains an empty filtered list when only built-in tasks exist", async () => {
  vi.mocked(api.getAutomationOverview).mockResolvedValue({
    tasks: [{ ...native, is_builtin: true }],
    issues: [],
    hermes_installed: false,
  });
  await render();
  expect(container.textContent).toContain("已隐藏 1 个系统内置任务");
  expect(container.textContent).toContain("没有符合筛选条件的任务");
  expect(container.textContent).not.toContain("未发现自动化任务");
});

it("shows a friendly name in the list and keeps searchable identifiers in details", async () => {
  const task: api.AutomationTask = {
    ...native,
    id: "launchd:updater",
    source: "launchd",
    name: "Demo Updater",
    identifier: "org.example.DemoUpdater.wake",
    bundle_id: "org.example.DemoUpdater",
    icon: "data:image/png;base64,aWNvbg==",
  };
  vi.mocked(api.getAutomationOverview).mockResolvedValue({
    tasks: [task],
    issues: [],
    hermes_installed: false,
  });
  await render();
  expect(container.querySelector("tbody")?.textContent).toContain(
    "Demo Updater",
  );
  expect(container.querySelector("tbody")?.textContent).not.toContain(
    "org.example",
  );
  const search = container.querySelector("input")!;
  expect(container.querySelector("tbody img")?.getAttribute("src")).toBe(
    task.icon,
  );
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(search, task.identifier);
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  await click("Demo Updater");
  expect(container.querySelector("h1")?.textContent).toBe(task.name);
  await click("技术信息");
  expect(container.textContent).toContain(`任务标识${task.identifier}`);
  expect(container.textContent).toContain(`Bundle ID${task.bundle_id}`);
  expect(container.querySelector("img")?.getAttribute("src")).toBe(task.icon);
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

it("aggregates system and Hermes tasks and filters by source and status", async () => {
  await render();
  expect(api.getAutomationOverview).toHaveBeenCalledOnce();
  expect(api.getAutomationOverview).toHaveBeenCalledWith("zh");
  expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  await select("任务来源", "hermes");
  expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(container.querySelector("tbody")?.textContent).toContain("仓库审计");
  await select("任务来源", "system");
  expect(container.querySelector("tbody")?.textContent).toContain("系统备份");
  const statusSelect = container.querySelector<HTMLSelectElement>(
    '[aria-label="任务状态"]',
  )!;
  await act(async () => {
    statusSelect.value = "paused";
    statusSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.textContent).toContain("没有符合筛选条件的任务");
});

it("hides the Hermes entry unless executable installation evidence is present", async () => {
  vi.mocked(api.getAutomationOverview).mockResolvedValue({
    tasks: [native],
    issues: [],
    hermes_installed: false,
  });
  await render();
  expect(
    [...container.querySelectorAll('[aria-label="任务来源"] option')].map(
      (node) => node.textContent,
    ),
  ).toEqual(["全部调度器", "系统任务"]);
  await click("新建自动化");
  expect(
    [...container.querySelectorAll('[aria-label="调度器"] option')].map(
      (node) => node.textContent,
    ),
  ).toEqual(["系统任务"]);
});

it("shows source failures alongside available tasks and refreshes the catalog", async () => {
  vi.mocked(api.getAutomationOverview).mockResolvedValueOnce({
    tasks: [native],
    issues: [{ source: "hermes", message: "invalid JSON" }],
    hermes_installed: true,
  });
  await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "invalid JSON",
  );
  expect(container.querySelector("tbody")?.textContent).toContain("系统备份");
  await click("刷新");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
});

it("opens Orca-style prompt and schedule details with unknown execution data", async () => {
  await render();
  await click("仓库审计");
  expect(container.querySelector("h1")?.textContent).toBe(hermes.name);
  const overview = container.querySelector('[role="tabpanel"]')!;
  expect(overview.textContent).toContain(hermes.prompt);
  expect(overview.textContent).toContain("下次运行已停用");
  expect(
    container.querySelector('[aria-label="立即运行 仓库审计"]'),
  ).not.toBeNull();
  await click("技术信息");
  expect(container.textContent).toContain(hermes.location);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="返回自动化列表"]')!
      .click(),
  );
  expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  expect(document.activeElement?.textContent).toContain(hermes.name);
});

it("searches task content and preserves tasks when refresh fails", async () => {
  await render();
  const search = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(search, "依赖更新");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  vi.mocked(api.getAutomationOverview).mockRejectedValueOnce(
    new Error("query failed"),
  );
  await click("刷新");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "query failed",
  );
  expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
});

it("provides retry after an initial read failure and shows an actual empty state", async () => {
  vi.mocked(api.getAutomationOverview).mockRejectedValueOnce(
    new Error("unavailable"),
  );
  await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "unavailable",
  );
  expect(container.textContent).not.toContain("未发现自动化任务");
  vi.mocked(api.getAutomationOverview).mockResolvedValueOnce({
    tasks: [],
    issues: [],
    hermes_installed: false,
  });
  await click("刷新");
  expect(container.textContent).toContain("未发现自动化任务");
});

it("does not claim there are no tasks when every available source failed", async () => {
  vi.mocked(api.getAutomationOverview).mockResolvedValueOnce({
    tasks: [],
    issues: [{ source: "launchd", message: "permission denied" }],
    hermes_installed: false,
  });
  await render();
  expect(container.textContent).toContain("任务读取失败，请刷新重试");
  expect(container.textContent).not.toContain("未发现自动化任务");
});

it("falls back to a generic icon if an application icon cannot be decoded", async () => {
  vi.mocked(api.getAutomationOverview).mockResolvedValue({
    tasks: [{ ...native, icon: "data:image/png;base64,broken" }],
    issues: [],
    hermes_installed: false,
  });
  await render();
  const image = container.querySelector("tbody img")!;
  await act(async () => image.dispatchEvent(new Event("error")));
  expect(container.querySelector("tbody img")).toBeNull();
  expect(container.querySelector("tbody")?.textContent).toContain(native.name);
});

it("reloads localized names and ignores the old language response", async () => {
  let finish!: (value: api.AutomationOverview) => void;
  vi.mocked(api.getAutomationOverview)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValueOnce({
      tasks: [{ ...native, name: "English application" }],
      issues: [],
      hermes_installed: false,
    });
  await render();
  await act(async () => {
    await i18n.changeLanguage("en");
    root.render(
      <StrictMode>
        <MemoryRouter initialEntries={["/automation"]}>
          <Automation />
        </MemoryRouter>
      </StrictMode>,
    );
  });
  expect(api.getAutomationOverview).toHaveBeenLastCalledWith("en");
  await act(async () =>
    finish({
      tasks: [{ ...native, name: "旧语言名称" }],
      issues: [],
      hermes_installed: false,
    }),
  );
  expect(container.querySelector("tbody")?.textContent).toContain(
    "English application",
  );
  expect(container.textContent).not.toContain("旧语言名称");
  await i18n.changeLanguage("zh");
});

async function select(label: string, value: string) {
  const node = container.querySelector<HTMLSelectElement>(
    `select[aria-label="${label}"]`,
  )!;
  await act(async () => {
    node.value = value;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function input(label: string, value: string) {
  const node = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${label}"]`,
  )!;
  await act(async () => {
    const prototype =
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function ariaClick(label: string) {
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
      .click(),
  );
}

it("keeps list filters on return and supports direct task links and missing tasks", async () => {
  await render("/automation?task=missing");
  expect(container.textContent).toContain("任务已移除或当前不可用");
  await ariaClick("返回自动化列表");
  await select("任务来源", "hermes");
  await click(hermes.name);
  await ariaClick("返回自动化列表");
  expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(
    container.querySelector<HTMLSelectElement>('[aria-label="任务来源"]')!
      .value,
  ).toBe("hermes");
});

it("uses explicit ownership for the AgentHub filter rather than the job name", async () => {
  vi.mocked(api.getAutomationOverview).mockResolvedValue({
    tasks: [
      { ...native, name: "AgentHub-looking external job" },
      { ...hermes, origin: "agent_hub" },
    ],
    issues: [],
    hermes_installed: true,
  });
  await render();
  await act(async () =>
    container
      .querySelectorAll<HTMLButtonElement>(
        '[aria-label="任务创建者"] button',
      )[1]
      .click(),
  );
  expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(container.querySelector("tbody")?.textContent).toContain(hermes.name);
});

it("creates a manual command task with the shared DTO without running it on save", async () => {
  await render();
  await click("新建自动化");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("名称");
  await input("名称", "手动检查");
  await input("执行命令", "printf test");
  await select("日程", "manual");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(api.saveAutomation).toHaveBeenCalledWith(null, null, {
    name: "手动检查",
    provider: "system",
    content: "printf test",
    workdir: null,
    schedule: { kind: "manual" },
    enabled: true,
  });
  expect(api.runAutomation).not.toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

it("preserves editor content and retry controls after save failure", async () => {
  vi.mocked(api.saveAutomation).mockRejectedValueOnce(
    new Error("scheduler unavailable"),
  );
  await render();
  await click("新建自动化");
  await input("名称", "检查");
  await input("执行命令", "exit 0");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(
    container.querySelector('[role="dialog"] [role="alert"]')?.textContent,
  ).toContain("scheduler unavailable");
  expect(container.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(
    "exit 0",
  );
  await ariaClick("关闭");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

it("manual run requests are separate from saving and keep the original schedule", async () => {
  vi.mocked(api.getAutomationOverview).mockResolvedValue({
    tasks: [native, { ...hermes, status: "active" }],
    issues: [],
    hermes_installed: true,
  });
  await render();
  await ariaClick("立即运行 仓库审计");
  expect(api.runAutomation).toHaveBeenCalledWith(hermes.id);
  expect(api.saveAutomation).not.toHaveBeenCalled();
  expect(container.textContent).toContain("已请求运行");
  await click(hermes.name);
  await ariaClick("编辑自动化");
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="名称"]')!.value,
  ).toBe(hermes.name);
  await input("名称", "审计更新");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(api.saveAutomation).toHaveBeenCalledWith(
    hermes.id,
    null,
    expect.objectContaining({
      name: "审计更新",
      schedule: hermes.definition!.schedule,
    }),
  );
});

it("prevents repeat triggers while a manual request is pending and reports failures", async () => {
  vi.mocked(api.getAutomationOverview).mockResolvedValue({
    tasks: [native, { ...hermes, status: "active" }],
    issues: [],
    hermes_installed: true,
  });
  let reject!: (reason: unknown) => void;
  vi.mocked(api.runAutomation).mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  await render();
  await ariaClick("立即运行 仓库审计");
  expect(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="立即运行 仓库审计"]',
    )!.disabled,
  ).toBe(true);
  await act(async () => reject(new Error("already running")));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "already running",
  );
  expect(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="立即运行 仓库审计"]',
    )!.disabled,
  ).toBe(false);
});

it("fills a template without creating or running until the explicit create action", async () => {
  await render();
  await click("新建自动化");
  await click("使用模板");
  await ariaClick("磁盘空间检查");
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="名称"]')!.value,
  ).toBe("磁盘空间检查");
  expect(container.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(
    "df -h .",
  );
  expect(api.saveAutomation).not.toHaveBeenCalled();
  expect(api.runAutomation).not.toHaveBeenCalled();
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(api.saveAutomation).toHaveBeenCalledWith(
    null,
    null,
    expect.objectContaining({
      name: "磁盘空间检查",
      workdir: null,
      schedule: { kind: "interval", minutes: 60 },
    }),
  );
});
it("restored templates create paused copies and preserve existing task IDs", async () => {
  vi.mocked(api.getAutomationBackups).mockResolvedValue([
    {
      schema_version: 1,
      id: "agent_hub:11111111-1111-4111-8111-111111111111",
      shell: "sh",
      draft: {
        name: "备份检查",
        provider: "system",
        content: "pwd",
        workdir: null,
        schedule: { kind: "daily", hour: 9, minute: 0, weekdays: true },
        enabled: true,
      },
    },
  ]);
  await render();
  await click("新建自动化");
  await click("使用模板");
  await click("Git 备份");
  await ariaClick("备份检查");
  expect(container.textContent).toContain("保存为暂停状态");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(api.saveAutomation).toHaveBeenCalledWith(
    null,
    null,
    expect.objectContaining({ enabled: false }),
  );
  expect(api.runAutomation).not.toHaveBeenCalled();
});
it("Escape dismisses the themed menu before closing its parent editor", async () => {
  await render();
  await click("新建自动化");
  const trigger = container.querySelector<HTMLButtonElement>(
    'button[role="combobox"][aria-label="日程"]',
  )!;
  await act(async () => trigger.click());
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  await act(async () =>
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
    ),
  );
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

it("shows an empty backup state when only uninstalled Hermes definitions are available", async () => {
  vi.mocked(api.getAutomationOverview).mockResolvedValue({
    tasks: [native],
    issues: [],
    hermes_installed: false,
  });
  vi.mocked(api.getAutomationBackups).mockResolvedValue([
    {
      schema_version: 1,
      id: "agent_hub:11111111-1111-4111-8111-111111111111",
      shell: "sh",
      draft: hermes.definition!,
    },
  ]);
  await render();
  await click("新建自动化");
  await click("使用模板");
  await click("Git 备份");
  expect(container.textContent).toContain("暂无可用模板");
  expect(container.querySelector('button[aria-label="仓库审计"]')).toBeNull();
});

it("allows editing a running task and refreshes its finished state automatically", async () => {
  vi.useFakeTimers();
  const task = {
    ...hermes,
    source: "launchd" as const,
    origin: "agent_hub" as const,
    status: "running" as const,
    definition: {
      ...hermes.definition!,
      provider: "system" as const,
      enabled: true,
    },
  };
  const overview = { tasks: [task], issues: [], hermes_installed: false };
  vi.mocked(api.getAutomationOverview).mockResolvedValue(overview);
  await render("/automation?task=hermes%3Aaudit");
  const edit = container.querySelector<HTMLButtonElement>(
    'button[aria-label="编辑自动化"]',
  )!;
  expect(edit.disabled).toBe(false);
  await act(async () => edit.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.body.textContent).toContain("可修改任务配置");
  await click("取消");
  vi.mocked(api.getAutomationOverview).mockResolvedValue({
    ...overview,
    tasks: [{ ...task, status: "active", last_result: "0" }],
  });
  await act(async () => {
    const change = vi.mocked(api.onAutomationChanged).mock.calls.at(-1)![0];
    change();
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(api.getAutomationOverview).toHaveBeenCalledTimes(2);
  await act(async () => vi.advanceTimersByTimeAsync(12000));
  expect(api.getAutomationOverview).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("执行成功");
  expect(
    container.querySelector<HTMLButtonElement>(
      'button[aria-label="立即运行 仓库审计"]',
    )!.disabled,
  ).toBe(false);
});

it("shows the latest output without a history list and supports retry on a failed read", async () => {
  vi.mocked(api.getAutomationOutput).mockRejectedValue(
    new Error("output unavailable"),
  );
  await render("/automation?task=hermes%3Aaudit");
  await click("执行");
  expect(container.textContent).toContain("output unavailable");
  expect(container.textContent).toContain("不累积保存执行记录");
  vi.mocked(api.getAutomationOutput).mockResolvedValue({
    content: "disk check passed",
    truncated: false,
    available: true,
    kind: "system",
  });
  await click("重试");
  expect(container.textContent).toContain("disk check passed");
  expect(api.getAutomationOutput).toHaveBeenLastCalledWith(hermes.id);
  expect(container.textContent).not.toContain("output unavailable");
});

it("keeps displayed output and focus while a refresh is pending", async () => {
  await render("/automation?task=hermes%3Aaudit");
  await click("执行");
  expect(container.textContent).toContain("test output");
  let resolve!: (output: api.AutomationRunOutput) => void;
  vi.mocked(api.getAutomationOutput).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  button("刷新").focus();
  await click("刷新");
  expect(
    container.querySelector("#automation-detail-panel-runs pre")?.textContent,
  ).toBe("test output");
  expect(document.activeElement).toBe(button("刷新"));
  await act(async () =>
    resolve({
      content: "updated output",
      truncated: false,
      available: true,
      kind: "system",
    }),
  );
  expect(
    container.querySelector("#automation-detail-panel-runs pre")?.textContent,
  ).toBe("updated output");
});
