// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import zh from "../i18n/zh.json";
import { DeploymentModeSetting } from "./DeploymentModeSetting";

const api = vi.hoisted(() => ({ getSettings: vi.fn(), setSettings: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("../lib/tauri", () => api);
vi.mock("sonner", () => ({ toast }));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
const t = i18n.t.bind(i18n);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  api.getSettings.mockResolvedValue(null);
  api.setSettings.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const buttons = () => [
  ...container.querySelectorAll<HTMLButtonElement>('[role="group"] button'),
];
async function render() {
  await act(async () => root.render(<DeploymentModeSetting />));
}

it("shows one link/copy selector without writing a setting on load", async () => {
  await render();
  expect(buttons()).toHaveLength(2);
  expect(buttons()[0].getAttribute("aria-pressed")).toBe("true");
  expect(api.setSettings).not.toHaveBeenCalled();
  expect(container.textContent).toContain("普通项目链接到项目 .agents/skills");
});
it("preserves divergent legacy scopes until the user explicitly chooses", async () => {
  api.getSettings.mockImplementation(async (key: string) =>
    key === "sync_mode" ? "copy" : null,
  );
  await render();
  expect(container.textContent).toContain("原有设置在各范围不同，已保留");
  expect(
    buttons().every(
      (button) => button.getAttribute("aria-pressed") === "false",
    ),
  ).toBe(true);
  expect(api.setSettings).not.toHaveBeenCalled();
  await act(async () => buttons()[1].click());
  expect(api.setSettings).toHaveBeenCalledExactlyOnceWith(
    "deployment_mode",
    "copy",
  );
  expect(buttons()[1].getAttribute("aria-pressed")).toBe("true");
});
it("uses a saved unified choice over legacy scope preferences", async () => {
  api.getSettings.mockImplementation(async (key: string) =>
    key === "deployment_mode" ? "copy" : "symlink",
  );
  await render();
  expect(buttons()[1].getAttribute("aria-pressed")).toBe("true");
  expect(container.textContent).not.toContain("原有设置在各范围不同");
});
it("keeps the current choice and reports a failed save", async () => {
  api.setSettings.mockRejectedValue(new Error("save failed"));
  await render();
  await act(async () => buttons()[1].click());
  expect(buttons()[0].getAttribute("aria-pressed")).toBe("true");
  expect(toast.error).toHaveBeenCalledOnce();
});
it("disables choices after a load failure and allows retry", async () => {
  api.getSettings.mockRejectedValue(new Error("read failed"));
  await render();
  expect(buttons()[0].disabled).toBe(true);
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  api.getSettings.mockResolvedValue(null);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[role="alert"] button')
      ?.click(),
  );
  expect(buttons()[0].disabled).toBe(false);
});
it("blocks repeat saves until the first request finishes", async () => {
  let finish: (() => void) | undefined;
  api.setSettings.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  await act(async () => buttons()[1].click());
  expect(buttons().every((button) => button.disabled)).toBe(true);
  await act(async () => buttons()[0].click());
  expect(api.setSettings).toHaveBeenCalledOnce();
  await act(async () => finish?.());
  expect(buttons()[1].getAttribute("aria-pressed")).toBe("true");
});
