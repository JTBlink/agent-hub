// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
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
  },
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
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
    expect.any(Object),
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
  expect(unlisten).toHaveBeenCalledOnce();
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
