// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GitlabScheduleActions } from "./ScheduleActions";
import type { RepositorySchedule } from "../../../lib/repositoryScheduleApi";
import type { TaskBinding } from "../../../lib/taskBrowserApi";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../../../lib/repositoryScheduleApi", () => ({
  getScheduleConfig: api.get,
  editRepositorySchedule: api.edit,
  deleteRepositorySchedule: api.remove,
  runRepositorySchedule: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));
const binding: TaskBinding = {
  id: "demo",
  project_id: "demo",
  provider: "gitlab",
  host: "code.example.invalid",
  repository: "team/demo",
  launcher: null,
};
const schedule: RepositorySchedule = {
  id: "75",
  title: "Daily checks",
  target: "main",
  active: true,
  rules: [],
  last_status: null,
  last_run_url: null,
  next_run_at: null,
  owner: null,
  url: "https://code.example.invalid/team/demo/-/pipeline_schedules",
};
const config = {
  title: "Daily checks",
  target: "refs/tags/release",
  cron: "0 1 * * *",
  timezone: "Asia/Shanghai",
  active: true,
};
let root: Root;
let host: HTMLDivElement;
const changed = vi.fn();
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  api.get.mockReset().mockResolvedValue(config);
  api.edit.mockReset().mockResolvedValue(config);
  api.remove.mockReset().mockResolvedValue(undefined);
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
  await act(async () =>
    root.render(
      <GitlabScheduleActions
        binding={binding}
        schedule={schedule}
        onChanged={changed}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) =>
      node.getAttribute("aria-label") === label || node.textContent === label,
  )!;
}
async function openEdit() {
  button("schedules.edit").focus();
  await act(async () => button("schedules.edit").click());
}
async function input(index: number, value: string) {
  await act(async () => {
    const field = host.querySelectorAll("input")[index];
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function save() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

it("loads current settings and saves only changed fields, preserving the complete tag ref", async () => {
  await openEdit();
  expect(api.get).toHaveBeenCalledWith("demo", 75, expect.any(String));
  expect(host.querySelectorAll("input")[1].value).toBe("refs/tags/release");
  expect(button("common.save").disabled).toBe(true);
  await input(2, "0 2 * * *");
  await save();
  expect(api.edit).toHaveBeenCalledExactlyOnceWith("demo", 75, {
    cron: "0 2 * * *",
  });
  expect(host.querySelector("dialog")).toBeNull();
  expect(changed).toHaveBeenCalledTimes(1);
});

it("retains the draft after a save failure and cancels without writing", async () => {
  api.edit.mockRejectedValueOnce({
    kind: "permission",
    message: "Editing denied",
  });
  await openEdit();
  await input(0, "Renamed checks");
  await save();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    "Editing denied",
  );
  expect(host.querySelector("input")?.value).toBe("Renamed checks");
  expect(changed).not.toHaveBeenCalled();
  await act(async () => button("common.cancel").click());
  expect(host.querySelector("dialog")).toBeNull();
  expect(api.edit).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(button("schedules.edit"));
});

it("requires confirmation to delete and preserves the confirmation after a rejected request", async () => {
  await act(async () => button("schedules.delete").click());
  expect(api.remove).not.toHaveBeenCalled();
  await act(async () => button("common.cancel").click());
  expect(api.remove).not.toHaveBeenCalled();
  await act(async () => button("schedules.delete").click());
  api.remove.mockRejectedValueOnce({
    kind: "permission",
    message: "Deletion denied",
  });
  await act(async () => button("common.delete").click());
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    "Deletion denied",
  );
  expect(changed).not.toHaveBeenCalled();
  await act(async () => button("common.delete").click());
  expect(api.remove).toHaveBeenLastCalledWith("demo", 75);
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(changed).toHaveBeenCalledTimes(1);
});
