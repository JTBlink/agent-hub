// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import { CloseActionGuard } from "./CloseActionGuard";

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  appExit: vi.fn(),
  hideToTray: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../lib/tauri", () => mocks);
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));

let root: Root;
let container: HTMLDivElement;
let requestClose: () => Promise<void>;
let requestExit: () => void;
let settings: Record<string, string | null>;
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
  settings = { show_tray_icon: "true", close_action: null };
  mocks.getSettings.mockImplementation(async (key: string) => settings[key]);
  mocks.setSettings.mockResolvedValue(undefined);
  mocks.appExit.mockResolvedValue(undefined);
  mocks.hideToTray.mockResolvedValue(undefined);
  mocks.listen.mockImplementation(async (_event, callback) => {
    if (_event === "window-close-requested") requestClose = callback;
    if (_event === "app-exit-requested") requestExit = callback;
    return mocks.unlisten;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <I18nextProvider i18n={i18n}>
        <CloseActionGuard />
      </I18nextProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const button = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.textContent === text,
  )!;
const closeWindow = () => act(async () => requestClose());
const click = (text: string) => act(async () => button(text).click());

it("asks before quitting even when quit was remembered, and cancel preserves sessions", async () => {
  settings.close_action = "close";
  await closeWindow();
  expect(mocks.appExit).not.toHaveBeenCalled();
  expect(container.textContent).toContain(zh.closeAction.exitMessage);
  await click(zh.common.cancel);
  expect(mocks.appExit).not.toHaveBeenCalled();
  await closeWindow();
  await click(zh.closeAction.close);
  expect(mocks.appExit).toHaveBeenCalledTimes(1);
});

it("does not quit when the tray is hidden and enables it before running in the background", async () => {
  settings.show_tray_icon = "false";
  settings.close_action = "hide";
  await closeWindow();
  expect(mocks.appExit).not.toHaveBeenCalled();
  expect(mocks.hideToTray).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(button(zh.closeAction.hide));
  expect(container.textContent).toContain(zh.closeAction.enableTrayHint);
  await click(zh.closeAction.hide);
  expect(mocks.setSettings).toHaveBeenCalledWith("show_tray_icon", "true");
  expect(mocks.setSettings.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.hideToTray.mock.invocationCallOrder[0],
  );
  expect(mocks.hideToTray).toHaveBeenCalledTimes(1);
  expect(mocks.appExit).not.toHaveBeenCalled();
});

it("honors background preference without ending terminal sessions", async () => {
  settings.close_action = "hide";
  await closeWindow();
  expect(mocks.hideToTray).toHaveBeenCalledTimes(1);
  expect(mocks.appExit).not.toHaveBeenCalled();
  expect(container.querySelector("dialog")).toBeNull();
});

it("asks safely when settings cannot be loaded", async () => {
  mocks.getSettings.mockRejectedValueOnce(new Error("unavailable"));
  await closeWindow();
  expect(container.querySelector("dialog")?.open).toBe(true);
  expect(mocks.appExit).not.toHaveBeenCalled();
});

it("keeps the dialog and remember choice after a failed save so the operation can be retried", async () => {
  await closeWindow();
  await act(async () =>
    container.querySelector<HTMLInputElement>("input")!.click(),
  );
  mocks.setSettings.mockRejectedValueOnce(new Error("write failed"));
  await click(zh.closeAction.hide);
  expect(mocks.hideToTray).not.toHaveBeenCalled();
  expect(container.querySelector("dialog")?.open).toBe(true);
  expect(container.querySelector<HTMLInputElement>("input")!.checked).toBe(
    true,
  );
  expect(mocks.error).toHaveBeenCalled();
  await click(zh.closeAction.hide);
  expect(mocks.hideToTray).toHaveBeenCalledTimes(1);
  expect(container.querySelector("dialog")).toBeNull();
});

it("Escape cancels the choice and restores the previous focus", async () => {
  const previous = document.createElement("button");
  document.body.append(previous);
  previous.focus();
  await closeWindow();
  await act(async () =>
    container
      .querySelector("dialog")!
      .dispatchEvent(new Event("cancel", { cancelable: true })),
  );
  expect(container.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(previous);
  expect(mocks.appExit).not.toHaveBeenCalled();
  previous.remove();
});

it("ignores repeated close requests and clicks while hiding is pending", async () => {
  let resolve: () => void = () => {};
  mocks.hideToTray.mockReturnValueOnce(
    new Promise<void>((done) => {
      resolve = done;
    }),
  );
  await closeWindow();
  await act(async () => {
    button(zh.closeAction.hide).click();
    button(zh.closeAction.hide).click();
  });
  await closeWindow();
  expect(mocks.hideToTray).toHaveBeenCalledTimes(1);
  expect(button(zh.common.cancel).disabled).toBe(true);
  await act(async () => resolve());
});

it("unsubscribes when unmounted and ignores late settings responses", async () => {
  let resolve: (value: string) => void = () => {};
  mocks.getSettings.mockReturnValueOnce(
    new Promise<string>((done) => {
      resolve = done;
    }),
  );
  const pending = requestClose();
  await act(async () => root.unmount());
  await act(async () => {
    resolve("true");
    await pending;
  });
  expect(mocks.appExit).not.toHaveBeenCalled();
  expect(mocks.hideToTray).not.toHaveBeenCalled();
  expect(mocks.unlisten).toHaveBeenCalledTimes(2);
  root = createRoot(container);
});

it("confirms a menu quit even when window closing is configured to hide", async () => {
  settings.close_action = "hide";
  await act(async () => requestExit());
  expect(mocks.hideToTray).not.toHaveBeenCalled();
  expect(mocks.appExit).not.toHaveBeenCalled();
  await click(zh.common.cancel);
  expect(mocks.appExit).not.toHaveBeenCalled();
  await act(async () => requestExit());
  await click(zh.closeAction.close);
  expect(mocks.appExit).toHaveBeenCalledOnce();
});
