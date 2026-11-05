// @vitest-environment jsdom
import { act, createRef, useImperativeHandle } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WorktreePreviewsProvider } from "./useWorktreePreviews";
import { useWorktreePreviews } from "./worktreePreviewsContext";
import { listenDevelopmentLogHide } from "../lib/developmentPreview";
import { previewApi } from "../features/preview/api";
vi.mock("../features/preview/api", () => ({
  previewApi: {
    openProject: vi.fn(async () => ({
      id: "document",
      kind: "html",
      title: "index.html",
      content: "<p>Example</p>",
      revision: "1",
      url: "http://127.0.0.1/document",
    })),
    closeDocument: vi.fn(async () => {}),
  },
}));
it("hides the associated service logs only after a preview passes its close guard", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const controls =
    createRef<NonNullable<ReturnType<typeof useWorktreePreviews>>>();
  function Harness() {
    const previews = useWorktreePreviews()!;
    useImperativeHandle(controls, () => previews, [previews]);
    return null;
  }
  const hide = vi.fn();
  const unsubscribe = listenDevelopmentLogHide(hide);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <WorktreePreviewsProvider>
          <Harness />
        </WorktreePreviewsProvider>,
      ),
    );
    await act(async () =>
      controls.current!.open(
        "demo",
        "/projects/demo",
        "index.html",
        "http://127.0.0.1:54321/index.html",
      ),
    );
    const release = controls.current!.registerClose("document", () => false);
    await act(async () => controls.current!.close("document"));
    expect(hide).not.toHaveBeenCalled();
    expect(previewApi.closeDocument).not.toHaveBeenCalled();
    expect(controls.current!.tabs).toHaveLength(1);
    release();
    await act(async () => controls.current!.close("document"));
    expect(hide).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify(["demo", "/projects/demo"]),
      54321,
    );
    expect(previewApi.closeDocument).toHaveBeenCalledWith("document");
    expect(controls.current!.tabs).toHaveLength(0);
  } finally {
    unsubscribe();
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
