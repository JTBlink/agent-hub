// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import { open } from "@tauri-apps/plugin-dialog";
import * as api from "../../lib/tauri";
import zh from "../../i18n/zh.json";
import { AutomationDiscovery } from "./AutomationDiscovery";
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
const translate = i18n.t.bind(i18n);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate, i18n }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("../../lib/tauri", () => ({
  getAutomationTemplates: vi.fn(),
  getProjects: vi.fn(),
  previewAutomationPackage: vi.fn(),
  previewGitAutomationPackages: vi.fn(),
  importAutomationPackage: vi.fn(),
  saveAutomation: vi.fn(),
  setAutomationInstallation: vi.fn(),
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
  schema_version: 1,
  shell: "sh",
  draft,
  dependencies: [{ kind: "python", packages: ["example==1.0"] }],
};
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
