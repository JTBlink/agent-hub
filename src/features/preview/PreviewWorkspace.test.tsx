// @vitest-environment jsdom
import {
  act,
  createRef,
  useEffectEvent,
  useEffect,
  useImperativeHandle,
} from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PreviewWorkspace } from "./PreviewWorkspace";
import { previewApi } from "./api";
import { queuePreviewDocument, queuePreviewWeb } from "./shared/openRequests";
import type { BrowserSurfaceProps } from "./web/types";
import { usePreviewWorkspace, type PreviewModel } from "./usePreviewWorkspace";

const t = (key: string) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("./web/useBrowserInventory", () => ({ useBrowserInventory: vi.fn() }));
vi.mock("../../components/file-reader/CodeEditor", () => ({
  CodeEditor: ({
    file,
    onChange,
  }: {
    file: { content: string };
    onChange?: unknown;
  }) => (
    <div className="cm-editor">
      <textarea readOnly={!onChange} value={file.content} />
    </div>
  ),
}));
vi.mock("../../lib/tauri", () => ({
  getSettings: vi.fn().mockResolvedValue(null),
  setSettings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./api", () => ({
  previewApi: {
    info: vi.fn().mockResolvedValue({ profiles: [] }),
    closeDocument: vi.fn().mockResolvedValue(undefined),
    action: vi
      .fn()
      .mockResolvedValue(
        "http://127.0.0.1:4321/devtools/devtools_app.html?ws=fixture",
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
    return (
      <output
        data-surface={props.tabId}
        data-viewport={JSON.stringify(props.viewport)}
      >
        {props.address}
      </output>
    );
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
    ).toContain("/devtools/devtools_app.html");
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

it("toggles a web page between its preserved browser surface and read-only HTML", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  localStorage.setItem(
    "agent-hub.preview.tabs.v1",
    JSON.stringify([
      {
        address: "https://example.invalid/",
        title: "Example",
        profile: "default",
      },
    ]),
  );
  vi.mocked(previewApi.action).mockResolvedValue(
    "<html><body>Example</body></html>",
  );
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<PreviewWorkspace shown embedded />));
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="fileReader.source"]')!
        .click(),
    );
    expect(host.querySelector("textarea")?.value).toContain(
      "<body>Example</body>",
    );
    expect(host.querySelector("textarea")?.readOnly).toBe(true);
    for (const modifiers of [{ metaKey: true }, { ctrlKey: true }]) {
      const find = new KeyboardEvent("keydown", {
        key: "f",
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });
      await act(async () =>
        host.querySelector("textarea")!.dispatchEvent(find),
      );
      expect(find.defaultPrevented).toBe(false);
      expect(host.querySelector(".preview-find")).toBeNull();
    }
    expect(
      host.querySelector<HTMLDivElement>(".preview-native-page")?.hidden,
    ).toBe(true);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="fileReader.preview"]')!
        .click(),
    );
    expect(host.querySelector("textarea")).toBeNull();
    expect(
      host.querySelector<HTMLDivElement>(".preview-native-page")?.hidden,
    ).toBe(false);
  } finally {
    await act(async () => root.unmount());
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});

it("applies a queued mobile viewport only to its new browser tab", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const viewport = { width: 390, height: 844, mobile: true };
  try {
    await act(async () => root.render(<PreviewWorkspace shown />));
    await act(async () => queuePreviewWeb("about:blank", "default", viewport));
    expect(
      JSON.parse(
        host.querySelector<HTMLElement>("[data-surface]")!.dataset.viewport!,
      ),
    ).toEqual(viewport);
    await act(async () => queuePreviewWeb("about:blank"));
    const surfaces = host.querySelectorAll<HTMLElement>("[data-surface]");
    expect(surfaces).toHaveLength(2);
    expect(JSON.parse(surfaces[0].dataset.viewport!)).toEqual(viewport);
    expect(JSON.parse(surfaces[1].dataset.viewport!)).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});

it("focuses an already open file while retaining its unsaved draft and original revision", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  const model = createRef<PreviewModel>();
  const initial = {
    id: "existing",
    kind: "markdown" as const,
    title: "guide.md",
    path: "/workspace/guide.md",
    content: "# Original",
    revision: "first",
  };
  function Receiver() {
    const value = usePreviewWorkspace({ initialDocument: initial });
    useImperativeHandle(model, () => value);
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Receiver />));
    await act(async () => model.current!.changeDraft("# Unsaved"));
    await act(async () =>
      queuePreviewDocument({
        ...initial,
        id: "incoming",
        content: "# Disk changed",
        revision: "second",
      }),
    );
    expect(model.current!.session.tabs).toHaveLength(1);
    expect(model.current!.session.activeId).toBe("doc:existing");
    expect(model.current!.draft).toBe("# Unsaved");
    expect(model.current!.document?.revision).toBe("first");
    expect(previewApi.closeDocument).toHaveBeenCalledWith("incoming");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
