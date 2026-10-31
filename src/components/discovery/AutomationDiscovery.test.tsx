// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import { open } from "@tauri-apps/plugin-dialog";
import * as api from "../../lib/tauri";
import { codeEditor, installCodeEditorGeometry } from "../../test/codeEditor";
import { openPreviewInVscode } from "../../lib/openInVscode";
import zh from "../../i18n/zh.json";
import { AutomationDiscovery } from "./AutomationDiscovery";
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
const translate = i18n.t.bind(i18n);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate, i18n }),
}));
vi.mock("../../lib/openInVscode", () => ({ openPreviewInVscode: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("../../lib/tauri", () => ({
  getAutomationTemplates: vi.fn(),
  getProjects: vi.fn(),
  previewAutomationPackage: vi.fn(),
  previewGitAutomationPackages: vi.fn(),
  importAutomationPackage: vi.fn(),
  saveAutomation: vi.fn(),
  setAutomationInstallation: vi.fn(),
  getAutomationOverview: vi.fn(),
  onAutomationChanged: vi.fn(),
}));
const draft: api.AutomationDraft = {
  name: "Example task",
  content: "echo example",
  provider: "system",
  workdir: null,
  script_dir: null,
  enabled: true,
  schedule: { kind: "daily", hour: 9, minute: 0, weekdays: false },
  files: [{ path: "scripts/run.sh", content: "echo example" }],
};
const taskPackage: api.AutomationPackage = {
  version: "1.3.0",
  schema_version: 1,
  shell: "sh",
  draft,
  dependencies: [{ kind: "python", packages: ["example==1.0"] }],
};
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  installCodeEditorGeometry();
  vi.clearAllMocks();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(api.getAutomationTemplates).mockResolvedValue({
    shell: "sh",
    templates: [
      {
        id: "example",
        title: "Example task",
        description: "Example description",
        draft,
      },
    ],
  });
  vi.mocked(api.getProjects).mockResolvedValue([]);
  vi.mocked(api.getAutomationOverview).mockResolvedValue({
    tasks: [],
    issues: [],
    hermes_installed: false,
  });
  vi.mocked(api.onAutomationChanged).mockResolvedValue(() => {});
  vi.mocked(api.previewAutomationPackage).mockResolvedValue(taskPackage);
  vi.mocked(api.importAutomationPackage).mockResolvedValue("agent_hub:example");
  vi.mocked(api.saveAutomation).mockResolvedValue("agent_hub:example");
  vi.mocked(api.setAutomationInstallation).mockResolvedValue();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(source: "recommended" | "git" | "local") {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <AutomationDiscovery active source={source} />
      </MemoryRouter>,
    ),
  );
}
async function click(label: string) {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (b) => b.textContent === label || b.getAttribute("aria-label") === label,
  );
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
async function input(node: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    document
      .querySelector("dialog form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
it("opens a separate full-screen read-only preview and returns to configuration", async () => {
  const files = [
    { path: "scripts/run.sh", content: "echo package-preview" },
    {
      path: "README.md",
      content: "# Package overview\nRead before installing.",
    },
    { path: "scripts/lib/check.py", content: "print('ready')" },
  ];
  vi.mocked(api.getAutomationTemplates).mockResolvedValue({
    shell: "sh",
    templates: [
      {
        id: "example",
        title: "Example task",
        description: "Example description",
        draft: { ...draft, files },
      },
    ],
  });
  await render("recommended");
  await click("安装 Example task");
  const installer = document.querySelector("dialog")!;
  expect(installer.querySelector("h1")).toBeNull();
  const previewButton = [...installer.querySelectorAll("button")].find(
    (button) => button.textContent === "打开预览",
  )!;
  previewButton.focus();
  await click("打开预览");
  const dialog = document.querySelector<HTMLDialogElement>(
    "dialog[data-file-reader]",
  )!;
  expect(dialog.open).toBe(true);
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(dialog.querySelector('[aria-label="还原阅读窗口"]')).toBeTruthy();
  expect(dialog.querySelector("h1")?.textContent).toBe("Package overview");
  expect(
    dialog
      .querySelector('button[aria-label="README.md"]')
      ?.getAttribute("aria-current"),
  ).toBe("page");
  expect(
    [...dialog.querySelectorAll("aside summary")].map(
      (node) => node.textContent,
    ),
  ).toEqual(["scripts", "lib"]);
  await click("scripts/lib/check.py");
  const source = codeEditor(dialog);
  expect(source.state.sliceDoc()).toBe("print('ready')");
  expect(source.state.readOnly).toBe(true);
  expect(
    dialog.querySelector<HTMLButtonElement>('[aria-label="在 VS Code 中打开"]')!
      .disabled,
  ).toBe(false);
  await click("在 VS Code 中打开");
  expect(openPreviewInVscode).toHaveBeenLastCalledWith(
    "scripts/lib/check.py",
    "print('ready')",
  );
  expect(dialog.textContent).toContain("VS Code 中的修改不会写回任务");
  await click("README.md");
  await click("源码");
  expect(codeEditor(dialog).state.sliceDoc()).toContain("# Package overview");
  await click("预览");
  expect(dialog.querySelector("h1")?.textContent).toBe("Package overview");
  expect(api.saveAutomation).not.toHaveBeenCalled();
  expect(api.importAutomationPackage).not.toHaveBeenCalled();
  expect(dialog.querySelector('[name="task-name"]')).toBeNull();
  await act(async () => {
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
  });
  expect(document.querySelector("dialog[data-file-reader]")).toBeNull();
  expect(installer.open).toBe(true);
  expect(document.activeElement).toBe(previewButton);
  await click("打开预览");
  const reopened = document.querySelector("dialog[data-file-reader]")!;
  await act(async () => {
    reopened.querySelector<HTMLButtonElement>('[aria-label="关闭"]')!.click();
  });
  expect(document.querySelector("dialog[data-file-reader]")).toBeNull();
  expect(document.activeElement).toBe(previewButton);
  await submit();
  expect(
    installer.querySelector<HTMLInputElement>('[name="task-name"]')?.value,
  ).toBe("Example task");
});

it("previews before creating and installs a configured recommendation paused", async () => {
  await render("recommended");
  await click("安装 Example task");
  expect(api.saveAutomation).not.toHaveBeenCalled();
  await submit();
  await input(
    document.querySelector<HTMLInputElement>('[name="task-name"]')!,
    "My task",
  );
  await click("返回");
  await submit();
  expect(
    document.querySelector<HTMLInputElement>('[name="task-name"]')?.value,
  ).toBe("My task");
  await submit();
  expect(api.saveAutomation).toHaveBeenCalledExactlyOnceWith(
    null,
    null,
    expect.objectContaining({ name: "My task", enabled: false }),
    false,
  );
  expect(api.setAutomationInstallation).toHaveBeenCalledExactlyOnceWith(
    "agent_hub:example",
    true,
  );
  expect(document.querySelector("dialog")?.textContent).toContain(
    "已安装，计划已暂停",
  );
});
it("imports previewed bytes and retries a failed install on the same instance", async () => {
  vi.mocked(open).mockResolvedValue("/tmp/example-task.json");
  vi.mocked(api.setAutomationInstallation).mockRejectedValueOnce(
    new Error("Missing dependency"),
  );
  await render("local");
  await click("选择 JSON 文件");
  expect(api.previewAutomationPackage).toHaveBeenCalledWith(
    "/tmp/example-task.json",
  );
  expect(api.importAutomationPackage).not.toHaveBeenCalled();
  await submit();
  await submit();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Missing dependency",
  );
  expect(api.importAutomationPackage).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      dependencies: taskPackage.dependencies,
      draft: expect.objectContaining({ enabled: false }),
    }),
    null,
  );
  await submit();
  expect(api.importAutomationPackage).toHaveBeenCalledTimes(1);
  expect(api.setAutomationInstallation).toHaveBeenCalledTimes(2);
});
it("shows the pinned Git revision, keeps partial errors, and installs its snapshot", async () => {
  vi.mocked(api.previewGitAutomationPackages).mockResolvedValue({
    revision: "fixed-commit",
    packages: [{ path: "automations/example", package: taskPackage }],
    issues: [{ path: "automations/broken", message: "Bad manifest" }],
  });
  await render("git");
  await input(
    host.querySelector<HTMLInputElement>("input")!,
    "https://example.invalid/team/tasks.git",
  );
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(host.textContent).toContain("fixed-commit");
  expect(host.textContent).toContain("Bad manifest");
  await click("安装 Example task");
  await submit();
  await submit();
  expect(api.importAutomationPackage).toHaveBeenCalledTimes(1);
  expect(api.previewGitAutomationPackages).toHaveBeenCalledTimes(1);
});

it("explains Git recognition and reveals the same manifest used by the documented example", async () => {
  await render("git");
  expect(host.textContent).toContain("每个任务目录必须有 task.json");
  expect(host.textContent).toContain("只扫描 automations/");
  expect(
    host.querySelector('pre[aria-label="推荐的任务仓库目录结构"]')?.textContent,
  ).toContain("scripts/");
  const details = host.querySelector("details")!;
  expect(details.open).toBe(false);
  await act(async () => details.querySelector("summary")!.click());
  expect(details.open).toBe(true);
  const manifest = JSON.parse(details.querySelector("code")!.textContent!);
  expect(manifest.schema_version).toBe(1);
  expect(manifest.files).toEqual(["scripts/run.sh"]);
  expect(details.textContent).toContain("Example task completed");
  expect(host.textContent).toContain("目前仅支持 GitHub 的 tree 链接");
  expect(api.previewGitAutomationPackages).not.toHaveBeenCalled();
});
it("ignores a local picker result after changing sources", async () => {
  let resolve: (value: string) => void = () => {};
  vi.mocked(open).mockReturnValue(
    new Promise<string>((r) => {
      resolve = r;
    }),
  );
  await render("local");
  await click("选择任务目录");
  await render("git");
  await act(async () => resolve("/tmp/example"));
  expect(api.previewAutomationPackage).not.toHaveBeenCalled();
  expect(document.querySelector("dialog")).toBeNull();
});

it("does not leak source errors or block a different source behind a pending preview", async () => {
  let rejectGit: (error: Error) => void = () => {};
  vi.mocked(api.previewGitAutomationPackages).mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectGit = reject;
    }),
  );
  vi.mocked(open).mockResolvedValue("/tmp/example-task.json");
  await render("git");
  await input(
    host.querySelector<HTMLInputElement>("input")!,
    "https://example.invalid/team/tasks.git",
  );
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  await render("local");
  await click("选择 JSON 文件");
  expect(api.previewAutomationPackage).toHaveBeenCalledTimes(1);
  await act(async () => rejectGit(new Error("Stale Git failure")));
  expect(document.body.textContent).not.toContain("Stale Git failure");
});

function existingTask(
  overrides: Partial<api.AutomationTask> = {},
): api.AutomationTask {
  return {
    id: "agent_hub:existing",
    name: draft.name,
    identifier: null,
    bundle_id: null,
    icon: null,
    source: "launchd",
    origin: "agent_hub",
    can_edit: true,
    can_run: true,
    definition: { ...draft, script_dir: "~/automations/example" },
    revision: 7,
    installation: "installed",
    is_builtin: false,
    schedule: "daily",
    project: null,
    next_run: null,
    last_run: null,
    status: "paused",
    last_result: null,
    command: draft.content,
    prompt: null,
    location: "~/automations/example",
    ...overrides,
  };
}
function setOverview(tasks: api.AutomationTask[]) {
  vi.mocked(api.getAutomationOverview).mockResolvedValue({
    tasks,
    issues: [],
    hermes_installed: false,
  });
}
it("refreshes installed cards after installation and when revisiting a source", async () => {
  vi.mocked(api.setAutomationInstallation).mockImplementation(async () => {
    setOverview([
      existingTask({ id: "agent_hub:example", name: "Custom task" }),
    ]);
  });
  await render("recommended");
  await click("安装 Example task");
  await submit();
  await input(
    document.querySelector<HTMLInputElement>('[name="task-name"]')!,
    "Custom task",
  );
  await submit();
  expect(host.querySelector("article")?.textContent).toContain("已安装");
  await click("关闭");
  await render("local");
  await render("recommended");
  expect(
    host.querySelector('[aria-label="重新安装 Example task"]'),
  ).not.toBeNull();
});
it("updates installed state on external task changes, including uninstall", async () => {
  setOverview([existingTask()]);
  await render("recommended");
  expect(host.querySelector("article")?.textContent).toContain("已安装");
  vi.useFakeTimers();
  try {
    setOverview([
      existingTask({ installation: "uninstalled", can_run: false }),
    ]);
    await act(async () => {
      vi.mocked(api.onAutomationChanged).mock.calls.at(-1)![0]();
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(host.querySelector("article")?.textContent).not.toContain("已安装");
    expect(
      host.querySelector('[aria-label="安装 Example task"]'),
    ).not.toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
it("checks names at submission, cancels without writing, and allows a different name", async () => {
  await render("recommended");
  setOverview([existingTask()]);
  await click("安装 Example task");
  await submit();
  await submit();
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    "覆盖同名自动化任务",
  );
  expect(api.saveAutomation).not.toHaveBeenCalled();
  expect(api.setAutomationInstallation).not.toHaveBeenCalled();
  await act(async () => {
    [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[role="alertdialog"] button',
      ),
    ]
      .find((button) => button.textContent === "取消")!
      .click();
  });
  await input(
    document.querySelector<HTMLInputElement>('[name="task-name"]')!,
    "Other task",
  );
  await submit();
  expect(api.saveAutomation).toHaveBeenCalledExactlyOnceWith(
    null,
    null,
    expect.objectContaining({ name: "Other task" }),
    false,
  );
});
it("overwrites the selected identity only after confirmation and preserves imported requirements", async () => {
  setOverview([existingTask()]);
  vi.mocked(open).mockResolvedValue("/tmp/example-task.json");
  await render("local");
  await click("选择 JSON 文件");
  await submit();
  await submit();
  expect(api.importAutomationPackage).not.toHaveBeenCalled();
  expect(api.saveAutomation).not.toHaveBeenCalled();
  vi.mocked(api.saveAutomation).mockResolvedValue("agent_hub:existing");
  await click("确认覆盖安装");
  expect(api.saveAutomation).toHaveBeenCalledExactlyOnceWith(
    "agent_hub:existing",
    7,
    expect.objectContaining({
      enabled: false,
      script_dir: "~/automations/example",
      workdir: null,
      package_options: {
        version: "1.3.0",
        dependencies: taskPackage.dependencies,
        hermes: undefined,
      },
    }),
  );
  expect(api.setAutomationInstallation).toHaveBeenCalledExactlyOnceWith(
    "agent_hub:existing",
    true,
  );
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.querySelector("dialog")?.textContent).toContain(
    "已安装，计划已暂停",
  );
});
it("keeps overwrite failures reviewable and retries without creating a duplicate", async () => {
  setOverview([existingTask()]);
  vi.mocked(api.saveAutomation).mockRejectedValueOnce(
    new Error("Task changed; refresh before saving"),
  );
  await render("recommended");
  await click("重新安装 Example task");
  await submit();
  await submit();
  await click("确认覆盖安装");
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    "Task changed",
  );
  expect(api.setAutomationInstallation).not.toHaveBeenCalled();
  vi.mocked(api.saveAutomation).mockResolvedValue("agent_hub:existing");
  await click("确认覆盖安装");
  expect(api.saveAutomation).toHaveBeenCalledTimes(2);
  expect(
    vi
      .mocked(api.saveAutomation)
      .mock.calls.every(([id]) => id === "agent_hub:existing"),
  ).toBe(true);
});
it("never silently picks from multiple same-name tasks", async () => {
  setOverview([
    existingTask(),
    existingTask({
      id: "agent_hub:other",
      revision: 9,
      project: "~/projects/demo",
    }),
  ]);
  await render("recommended");
  await click("重新安装 Example task");
  await submit();
  await submit();
  await act(async () =>
    document
      .querySelector<HTMLInputElement>('input[value="agent_hub:other"]')!
      .click(),
  );
  await click("确认覆盖安装");
  expect(api.saveAutomation).toHaveBeenCalledWith(
    "agent_hub:other",
    9,
    expect.objectContaining({ enabled: false }),
  );
});
it.each([
  { origin: "external" as const, can_edit: false },
  { status: "running" as const },
  { installation: "install_failed" },
  { definition: { ...draft, provider: "hermes" as const } },
])("blocks unsafe same-name replacement: %j", async (overrides) => {
  setOverview([existingTask(overrides)]);
  await render("local");
  vi.mocked(open).mockResolvedValue("/tmp/example-task.json");
  await click("选择 JSON 文件");
  await submit();
  await submit();
  const confirm = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[role="alertdialog"] button',
    ),
  ].find((button) => button.textContent === "确认覆盖安装")!;
  expect(confirm.disabled).toBe(true);
  expect(api.saveAutomation).not.toHaveBeenCalled();
  expect(api.importAutomationPackage).not.toHaveBeenCalled();
});
it("does not create a task if the fresh name check fails", async () => {
  await render("recommended");
  await click("安装 Example task");
  await submit();
  vi.mocked(api.getAutomationOverview).mockRejectedValue(
    new Error("Cannot read tasks"),
  );
  await submit();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Cannot read tasks",
  );
  expect(api.saveAutomation).not.toHaveBeenCalled();
});

it("shows an available task version and confirms the installed version before replacement", async () => {
  vi.mocked(api.getAutomationTemplates).mockResolvedValue({
    shell: "sh",
    templates: [
      {
        id: "example",
        title: "Example task",
        description: "Example description",
        draft: {
          ...draft,
          package_options: { version: "2.0.0", dependencies: [] },
        },
      },
    ],
  });
  setOverview([
    existingTask({
      definition: {
        ...draft,
        package_options: { version: "1.0.0", dependencies: [] },
      },
    }),
  ]);
  await render("recommended");
  expect(host.textContent).toContain("v2.0.0");
  expect(host.textContent).toContain("有新版本");
  await click("重新安装 Example task");
  expect(document.querySelector("dialog")?.textContent).toContain("2.0.0");
  await submit();
  await submit();
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    "当前 1.0.0 → 安装 2.0.0",
  );
  await click("确认覆盖安装");
  expect(api.saveAutomation).toHaveBeenCalledWith(
    "agent_hub:existing",
    7,
    expect.objectContaining({
      package_options: expect.objectContaining({ version: "2.0.0" }),
    }),
  );
});
