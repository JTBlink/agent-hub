// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserSurface } from "./BrowserSurface";
import { previewApi, type BrowserFrame, type PickedElement } from "../api";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
const t = (key: string) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../api", () => ({
  previewApi: {
    frame: vi.fn(),
    action: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn(),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it.each([true, false])(
  "rejects stale hover copy with navigation polled=%s",
  async (polled) => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    let revision = "first";
    const address = "https://example.invalid/";
    vi.mocked(previewApi.frame).mockImplementation(
      async (): Promise<BrowserFrame> => ({
        version: 1,
        image: "image",
        events: [],
        info: {
          url: address,
          title: "Page",
          revision,
          ready: "complete",
          width: 1200,
          height: 800,
          scrollX: 0,
          scrollY: 0,
          dpr: 1,
        },
      }),
    );
    const picked: PickedElement = {
      selector: "button",
      text: "Continue",
      html: "<button>Continue</button>",
      styles: {},
      bounds: { x: 0, y: 0, width: 100, height: 30 },
      documentBounds: { x: 0, y: 0, width: 100, height: 30 },
      url: address,
      revision,
    };
    vi.mocked(previewApi.action).mockResolvedValue(picked);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <BrowserSurface
            tabId="tab"
            initialId="page"
            active
            address={address}
            profile="default"
            picking
            viewport={null}
            onReady={vi.fn()}
            onFrame={vi.fn()}
            onCapture={vi.fn()}
            onError={vi.fn()}
          />,
        ),
      );
      await act(async () => {
        container.querySelector(".preview-browser-image")!.dispatchEvent(
          new MouseEvent("pointermove", {
            bubbles: true,
            clientX: 10,
            clientY: 10,
          }),
        );
        await vi.advanceTimersByTimeAsync(80);
      });
      expect(
        container.querySelector(".preview-element-outline"),
      ).not.toBeNull();
      const copy = async () =>
        act(async () => {
          container
            .querySelector(".preview-browser-surface")!
            .dispatchEvent(
              new KeyboardEvent("keydown", { key: "c", bubbles: true }),
            );
        });
      await copy();
      expect(writeText).toHaveBeenCalledTimes(1);
      revision = "second";
      if (polled) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(400);
        });
      } else {
        vi.mocked(previewApi.action).mockRejectedValueOnce(
          new Error("Page changed"),
        );
        await copy();
      }
      expect(container.querySelector(".preview-element-outline")).toBeNull();
      await copy();
      expect(writeText).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  },
);
