// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { BrowserFrame, PickedElement } from "../../api";
import { listen } from "@tauri-apps/api/event";
import { NativeSurface } from "./NativeSurface";
import { nativeApi } from "./api";
import type { BrowserNavigation } from "../types";
vi.mock("./api", () => ({
  nativeApi: {
    open: vi.fn(),
    info: vi.fn(),
    update: vi.fn(),
    action: vi.fn(),
    picking: vi.fn(),
    frame: vi.fn(),
  },
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  Reflect.deleteProperty(document, "hidden");
});
function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(nativeApi.update).mockResolvedValue();
  vi.mocked(nativeApi.info).mockResolvedValue({
    engine: "WKWebView",
    inspection: true,
    persistent: true,
  });
  vi.mocked(nativeApi.action).mockResolvedValue();
  vi.mocked(nativeApi.picking).mockResolvedValue();
  const unlisten = vi.fn();
  vi.mocked(listen).mockResolvedValue(unlisten);
  const host = document.createElement("div");
  document.body.append(host);
  return { host, root: createRoot(host), unlisten };
}
it("hides the native view for menus, dialogs and inactive tabs, routes navigation and closes on unmount", async () => {
  const { root, unlisten } = setup();
  vi.mocked(nativeApi.open).mockResolvedValue("native-id");
  const navigation = vi.fn();
  const render = (active: boolean) =>
    root.render(
      <NativeSurface
        active={active}
        address="about:blank"
        onNavigation={navigation}
        onError={vi.fn()}
      />,
    );
  await act(async () => render(true));
  expect(nativeApi.update).toHaveBeenLastCalledWith(
    "native-id",
    true,
    expect.any(Object),
  );
  const navigate: BrowserNavigation = navigation.mock.calls[0][0];
  await navigate("reload");
  expect(nativeApi.action).toHaveBeenCalledWith("native-id", "reload");
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  await act(async () => {
    document.body.append(dialog);
  });
  expect(nativeApi.update).toHaveBeenLastCalledWith(
    "native-id",
    false,
    undefined,
  );
  await act(async () => {
    dialog.remove();
  });
  expect(nativeApi.update).toHaveBeenLastCalledWith(
    "native-id",
    true,
    expect.any(Object),
  );
  await act(async () => render(false));
  expect(nativeApi.update).toHaveBeenLastCalledWith("native-id", false);
  await act(async () => root.unmount());
  expect(nativeApi.action).toHaveBeenLastCalledWith("native-id", "close");
  expect(navigation).toHaveBeenLastCalledWith(null);
  expect(unlisten).toHaveBeenCalledTimes(2);
});
it("closes a view whose asynchronous creation finishes after its tab was removed", async () => {
  const { root } = setup();
  let finish!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    finish = resolve;
  });
  vi.mocked(nativeApi.open).mockReturnValue(pending);
  await act(async () =>
    root.render(
      <NativeSurface active address="about:blank" onError={vi.fn()} />,
    ),
  );
  await act(async () => root.unmount());
  await act(async () => {
    finish("late-view");
  });
  expect(nativeApi.action).toHaveBeenCalledExactlyOnceWith(
    "late-view",
    "close",
  );
  expect(nativeApi.update).not.toHaveBeenCalled();
});

it.each(["capture", "copy"] as const)(
  "delivers native %s data and preserves element information when screenshots fail",
  async (operation) => {
    const { host, root } = setup();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    vi.mocked(nativeApi.open).mockResolvedValue("native-id");
    const picked: PickedElement = {
      selector: "button",
      text: "Save",
      html: "<button>Save</button>",
      styles: {},
      bounds: { x: 10, y: 20, width: 100, height: 20 },
      documentBounds: { x: 10, y: 20, width: 100, height: 20 },
      revision: "rev",
      url: "https://example.invalid",
    };
    const frame: BrowserFrame = {
      version: 0,
      image: "",
      events: [],
      info: {
        url: picked.url,
        title: "Fixture",
        revision: "rev",
        ready: "complete",
        width: 800,
        height: 600,
        scrollX: 0,
        scrollY: 0,
        dpr: 1,
      },
    };
    vi.mocked(nativeApi.frame).mockResolvedValue({
      frame,
      picked,
      operation,
      screenshotUnavailable: operation === "capture",
    });
    const onCapture = vi.fn(),
      onError = vi.fn(),
      onPickingChange = vi.fn(),
      onFrame = vi.fn();
    const render = (active: boolean) =>
      root.render(
        <NativeSurface
          active={active}
          picking
          address={picked.url}
          onCapture={onCapture}
          onError={onError}
          onPickingChange={onPickingChange}
          onFrame={onFrame}
        />,
      );
    await act(async () => render(true));
    expect(onFrame).toHaveBeenCalledWith(frame);
    expect(onPickingChange).toHaveBeenCalledWith(false);
    if (operation === "capture") {
      expect(onCapture).toHaveBeenCalledWith(picked);
      expect(onError).toHaveBeenCalledWith(
        "preview.elementScreenshotUnavailable",
      );
      expect(host.textContent).toContain(
        "preview.elementScreenshotUnavailable",
      );
    } else {
      expect(writeText).toHaveBeenCalledWith(JSON.stringify(picked, null, 2));
      expect(onCapture).not.toHaveBeenCalled();
    }
    await act(async () => render(false));
    expect(nativeApi.picking).toHaveBeenLastCalledWith("native-id", false);
    await act(async () => root.unmount());
  },
);
it("opens new-window links only for the owning visible native tab", async () => {
  const { root } = setup();
  vi.mocked(nativeApi.open).mockResolvedValue("native-id");
  const onNewTab = vi.fn();
  const render = (active: boolean) =>
    root.render(
      <NativeSurface
        active={active}
        address="about:blank"
        onNewTab={onNewTab}
        onError={vi.fn()}
      />,
    );
  await act(async () => render(true));
  const listener = vi
    .mocked(listen)
    .mock.calls.find(([name]) => name === "preview-native-new-tab")?.[1];
  if (!listener) throw new Error("Popup listener missing");
  await act(async () =>
    listener({
      event: "preview-native-new-tab",
      id: 0,
      payload: { id: "other-view", url: "https://example.invalid/other" },
    }),
  );
  expect(onNewTab).not.toHaveBeenCalled();
  await act(async () =>
    listener({
      event: "preview-native-new-tab",
      id: 0,
      payload: { id: "native-id", url: "https://example.invalid/details" },
    }),
  );
  expect(onNewTab).toHaveBeenCalledExactlyOnceWith(
    "https://example.invalid/details",
  );
  await act(async () => render(false));
  await act(async () =>
    listener({
      event: "preview-native-new-tab",
      id: 0,
      payload: { id: "native-id", url: "https://example.invalid/background" },
    }),
  );
  expect(onNewTab).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});
