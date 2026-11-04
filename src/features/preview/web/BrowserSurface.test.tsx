// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserSurface } from "./BrowserSurface";
import { previewApi, type BrowserFrame, type PickedElement } from "../api";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
const t = (key: string) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../api", () => ({
  previewApi: {
    frame: vi.fn(),
    reconnect: vi.fn(),
    reopen: vi.fn(),
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
    const onError = vi.fn();
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
            onError={onError}
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
          new Error("PREVIEW_CONTEXT_CHANGED"),
        );
        await copy();
        expect(onError).toHaveBeenLastCalledWith("preview.pageChanged");
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

it.each([
  ["frame", "reconnect"],
  ["action", "reconnect"],
  ["frame", "reopen"],
])("discards queued text after %s failure during %s", async (failure, mode) => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  let failed = false,
    revision = "before";
  const frame: BrowserFrame = {
    version: 1,
    image: "image",
    events: [],
    info: {
      url: "https://example.invalid/",
      title: "Page",
      revision,
      ready: "complete",
      width: 1200,
      height: 800,
      scrollX: 0,
      scrollY: 0,
      dpr: 1,
    },
  };
  vi.mocked(previewApi.frame).mockImplementation(async () => {
    if (failed) throw new Error("Disconnected");
    return { ...frame, info: { ...frame.info, revision } };
  });
  let finishInput!: () => void;
  let rejectInput!: (error: Error) => void;
  let finishPaste!: (text: string) => void;
  vi.mocked(readText).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishPaste = resolve;
      }),
  );
  vi.mocked(previewApi.action).mockImplementation(async (_id, action) => {
    if (action.kind === "text" && action.text === "a")
      await new Promise<void>((resolve, reject) => {
        finishInput = resolve;
        rejectInput = reject;
      });
    return null;
  });
  vi.mocked(previewApi.reconnect).mockImplementation(async () => {
    failed = false;
    revision = "after";
  });
  vi.mocked(previewApi.reopen).mockImplementation(async () => {
    failed = false;
    revision = "new-document";
  });
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
          address={frame.info.url}
          profile="default"
          picking={false}
          viewport={null}
          onReady={vi.fn()}
          onFrame={vi.fn()}
          onCapture={vi.fn()}
          onError={vi.fn()}
        />,
      ),
    );
    const input = container.querySelector("textarea")!;
    for (const text of ["a", "b"])
      await act(async () => {
        input.value = text;
        input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      });
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "v",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });
    if (failure === "frame") {
      failed = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
    } else {
      await act(async () => {
        rejectInput(new Error("Disconnected"));
      });
    }
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "preview.connectionUnverified",
    );
    await act(async () => {
      const buttons = container.querySelectorAll<HTMLButtonElement>(
        '[role="alert"] button',
      );
      buttons[mode === "reopen" ? 1 : 0].click();
    });
    expect(
      mode === "reopen" ? previewApi.reopen : previewApi.reconnect,
    ).toHaveBeenCalledWith("page");
    await act(async () => {
      finishInput();
      finishPaste("late paste");
    });
    expect(
      vi
        .mocked(previewApi.action)
        .mock.calls.filter(([, action]) => action.kind === "text")
        .map(([, action]) => (action.kind === "text" ? action.text : "")),
    ).toEqual(["a"]);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("Page");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("requests Retina resolution while preserving logical viewport dimensions", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const density = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: 2,
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(previewApi.action).mockResolvedValue(undefined);
  const frame: BrowserFrame = {
    version: 1,
    image: "png-data",
    image_mime: "image/png",
    events: [],
    info: {
      url: "about:blank",
      title: "Example",
      revision: "retina",
      ready: "complete",
      width: 800,
      height: 600,
      dpr: 2,
      scrollX: 0,
      scrollY: 0,
    },
  };
  vi.mocked(previewApi.frame).mockResolvedValue(frame);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <BrowserSurface
          tabId="retina"
          initialId="retina-page"
          active
          address="about:blank"
          profile="default"
          picking={false}
          viewport={{ width: 800, height: 600, mobile: false }}
          onReady={vi.fn()}
          onFrame={vi.fn()}
          onCapture={vi.fn()}
          onError={vi.fn()}
        />,
      ),
    );
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(previewApi.action).toHaveBeenCalledWith("retina-page", {
      kind: "resize",
      width: 800,
      height: 600,
      mobile: false,
      device_scale_factor: 2,
    });
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,png-data",
    );
    vi.mocked(previewApi.frame).mockResolvedValue({
      ...frame,
      version: 2,
      image: "jpeg-data",
      image_mime: "image/jpeg",
    });
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/jpeg;base64,jpeg-data",
    );
    vi.mocked(previewApi.frame).mockResolvedValue({
      ...frame,
      version: 2,
      image: "",
    });
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/jpeg;base64,jpeg-data",
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    if (density) Object.defineProperty(window, "devicePixelRatio", density);
  }
});
