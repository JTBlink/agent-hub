// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../../i18n/zh.json";
import { AppVersionCheck } from "./AppVersionCheck";

const api = vi.hoisted(() => ({ checkAppUpdate: vi.fn() }));
const opener = vi.hoisted(() => ({ openUrl: vi.fn() }));
vi.mock("../../lib/tauri", () => api);
vi.mock("@tauri-apps/plugin-opener", () => opener);
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  opener.openUrl.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render() {
  const i18n = createInstance();
  await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
  await act(async () =>
    root.render(
      <I18nextProvider i18n={i18n}>
        <AppVersionCheck />
      </I18nextProvider>,
    ),
  );
}

it("checks only on request and offers the exact release download page when newer", async () => {
  api.checkAppUpdate.mockResolvedValue({
    has_update: true,
    current_version: "0.1.6",
    latest_version: "0.1.7",
    release_url: "https://github.com/JTBlink/agent-hub/releases/tag/v0.1.7",
  });
  await render();
  expect(api.checkAppUpdate).not.toHaveBeenCalled();
  await act(async () =>
    container.querySelector<HTMLButtonElement>("button")!.click(),
  );
  expect(container.textContent).toContain("0.1.7");
  expect(opener.openUrl).not.toHaveBeenCalled();
  await act(async () =>
    container.querySelectorAll<HTMLButtonElement>("button")[1].click(),
  );
  expect(opener.openUrl).toHaveBeenCalledExactlyOnceWith(
    "https://github.com/JTBlink/agent-hub/releases/tag/v0.1.7",
  );
});

it("blocks duplicate checks, reports network errors, and retries without claiming the app is current", async () => {
  let fail: ((error: unknown) => void) | undefined;
  api.checkAppUpdate.mockImplementation(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  await render();
  const button = container.querySelector<HTMLButtonElement>("button")!;
  await act(async () => {
    button.click();
    button.click();
  });
  expect(button.disabled).toBe(true);
  expect(api.checkAppUpdate).toHaveBeenCalledOnce();
  await act(async () =>
    fail?.({ kind: "network", message: "APP_UPDATE_CHECK_FAILED" }),
  );
  expect(container.textContent).toContain("检查更新失败");
  expect(container.textContent).not.toContain("当前已是最新版本");
  api.checkAppUpdate.mockResolvedValue({
    has_update: false,
    current_version: "0.1.6",
    latest_version: "0.1.6",
    release_url: "https://github.com/JTBlink/agent-hub/releases/tag/v0.1.6",
  });
  await act(async () => button.click());
  expect(container.textContent).toContain("当前已是最新版本");
  expect(container.querySelectorAll("button")).toHaveLength(1);
});

it("distinguishes a missing stable release from an up-to-date version", async () => {
  api.checkAppUpdate.mockRejectedValue({
    kind: "not_found",
    message: "APP_UPDATE_NO_RELEASE",
  });
  await render();
  await act(async () =>
    container.querySelector<HTMLButtonElement>("button")!.click(),
  );
  expect(container.textContent).toContain("尚无可用的正式版本");
  expect(container.textContent).not.toContain("当前已是最新版本");
});

it("keeps a download action available after the browser fails to open", async () => {
  api.checkAppUpdate.mockResolvedValue({
    has_update: true,
    current_version: "0.1.6",
    latest_version: "0.1.7",
    release_url: "https://github.com/JTBlink/agent-hub/releases/tag/v0.1.7",
  });
  opener.openUrl.mockRejectedValue(new Error("open failed"));
  await render();
  await act(async () =>
    container.querySelector<HTMLButtonElement>("button")!.click(),
  );
  await act(async () =>
    container.querySelectorAll<HTMLButtonElement>("button")[1].click(),
  );
  expect(container.textContent).toContain("无法打开发布页面");
  expect(
    container.querySelectorAll<HTMLButtonElement>("button")[1].disabled,
  ).toBe(false);
});
