// @vitest-environment jsdom
import { act, useEffectEvent, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PreviewWorkspace } from "./PreviewWorkspace";
import { previewApi } from "./api";
import type { BrowserSurfaceProps } from "./web/types";

const t = (key: string) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("./web/useBrowserInventory", () => ({ useBrowserInventory: vi.fn() }));
vi.mock("../../lib/tauri", () => ({
  getSettings: vi.fn().mockResolvedValue(null),
  setSettings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./api", () => ({
  previewApi: {
    info: vi.fn().mockResolvedValue({ profiles: [] }),
    action: vi
      .fn()
      .mockResolvedValue(
        "http://127.0.0.1:4321/devtools/inspector.html?ws=fixture",
      ),
  },
}));
vi.mock("./web/BrowserSurface", () => ({
  BrowserSurface: function Surface(props: BrowserSurfaceProps) {
    const ready = useEffectEvent(props.onReady);
    const tabId = props.tabId;
    useEffect(() => {
      ready(`page:${tabId}`);
    }, [tabId]);
    return <output data-surface={props.tabId}>{props.address}</output>;
  },
}));
it("starts with annotations hidden, toggles them from the toolbar and docks the current page inspector with F12", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <PreviewWorkspace
          shown
          embedded
          initialDocument={{
            id: "fixture",
            kind: "html",
            title: "Example",
            content: "<p>Example</p>",
            revision: "first",
            url: "http://127.0.0.1:4321/example",
          }}
        />,
      ),
    );
    const annotations = host.querySelector<HTMLButtonElement>(
      '.preview-addressbar [aria-label="preview.annotations"]',
    )!;
    expect(annotations.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector(".preview-inspector")).toBeNull();
    await act(async () => annotations.click());
    expect(annotations.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector(".preview-inspector")).not.toBeNull();
    await act(async () => annotations.click());
    expect(host.querySelector(".preview-inspector")).toBeNull();
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="preview.developerTools"]',
        )!
        .click(),
    );
    expect(previewApi.action).toHaveBeenCalledWith("page:doc:fixture", {
      kind: "devtools",
    });
    expect(
      host.querySelector(
        '.preview-devtools [data-surface="devtools:doc:fixture"]',
      )?.textContent,
    ).toContain("/devtools/inspector.html");
    expect(
      host.querySelector('[data-surface="doc:fixture"]')?.textContent,
    ).toContain("/example");
    await act(async () =>
      host
        .querySelector(".preview-workspace")!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "F12", bubbles: true }),
        ),
    );
    expect(host.querySelector(".preview-devtools")).toBeNull();
    await act(async () =>
      host
        .querySelector(".preview-workspace")!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "F12", bubbles: true }),
        ),
    );
    expect(host.querySelector(".preview-devtools")).not.toBeNull();
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '.preview-devtools [aria-label="common.close"]',
        )!
        .click(),
    );
    expect(host.querySelector(".preview-devtools")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
