// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AutomationTask } from "../lib/tauri";
import zh from "../i18n/zh.json";
import { AutomationCustomActions } from "./AutomationCustomActions";
import {
  withAutomationActions,
  automationActions,
} from "../lib/automationActions";
import { AutomationActionsEditor } from "./AutomationActionsEditor";

const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }),
}));
let root: Root;
let container: HTMLDivElement;
const execute = vi.fn();
const preview = vi.fn();
const draft = {
  name: "Check",
  provider: "system" as const,
  content: "echo check",
  workdir: null,
  enabled: false,
  schedule: { kind: "manual" as const },
  files: [{ path: "scripts/reset.py", content: "print('reset')" }],
};
const action = {
  id: "reset",
  name: "重置额度",
  description: "Reset counters",
  script: "scripts/reset.py",
  arguments: [],
  confirmation: "确认重置？",
  preview_arguments: ["--preview"],
};
const task: AutomationTask = {
  id: "agent_hub:demo",
  name: "Check",
  source: "launchd",
  origin: "agent_hub",
  is_package: true,
  can_edit: true,
  can_run: true,
  revision: 1,
  status: "paused",
  is_builtin: false,
  identifier: null,
  bundle_id: null,
  icon: null,
  project: null,
  next_run: null,
  last_run: null,
  last_result: null,
  command: null,
  prompt: null,
  location: "",
  schedule: "manual",
  definition: { ...draft, ...withAutomationActions(draft, [action]) },
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  execute.mockReset().mockResolvedValue(true);
  preview
    .mockReset()
    .mockResolvedValue({
      summary: "将重置一项",
      items: [{ label: "次数", current: "3", after: "0" }],
      preserved: ["历史保留"],
      token: "state-v1",
    });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(value = task) {
  await act(async () =>
    root.render(
      <AutomationCustomActions
        task={value}
        busy={false}
        onExecute={execute}
        onPreview={preview}
      />,
    ),
  );
}
async function click(label: string) {
  const button = [...document.querySelectorAll("button")].find(
    (item) => item.textContent === label,
  );
  expect(button).toBeTruthy();
  await act(async () => button?.click());
}

it("shows no custom buttons until a task declares actions", async () => {
  await render({ ...task, definition: draft });
  expect(container.querySelector("button")).toBeNull();
  expect(preview).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
it("previews changes before confirmation and returns the same token to execution", async () => {
  await render();
  await click("重置额度");
  expect(preview).toHaveBeenCalledOnce();
  expect(execute).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("历史保留");
  expect(document.body.textContent).toContain("当前值");
  const confirm = [...document.querySelectorAll("button")]
    .filter((button) => button.textContent === "重置额度")
    .at(-1);
  await act(async () => confirm?.click());
  expect(execute).toHaveBeenCalledWith(action, "state-v1");
});
it("does not execute when preview fails or the task is running", async () => {
  preview.mockResolvedValue(null);
  await render();
  await click("重置额度");
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(execute).not.toHaveBeenCalled();
  await render({ ...task, status: "running" });
  expect(container.querySelector("button")?.disabled).toBe(true);
});
it("adding an optional operation preserves existing task files", async () => {
  const change = vi.fn();
  await act(async () =>
    root.render(
      <AutomationActionsEditor
        draft={draft}
        disabled={false}
        onChange={change}
      />,
    ),
  );
  await click("添加操作");
  const update = change.mock.calls[0][0];
  expect(update.files[0]).toEqual(draft.files[0]);
  expect(automationActions({ ...draft, ...update }).actions).toHaveLength(1);
});
