// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useAnnotationMarkers } from "./useAnnotationMarkers";
import { previewApi } from "../api";
import type { Annotation } from "./session";
vi.mock("../api", () => ({
  previewApi: { action: vi.fn().mockResolvedValue(true) },
}));
it("verifies the document before injecting and ignores note text edits while cleaning up on unmount", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const note: Annotation = {
    id: "one",
    tabId: "tab",
    revision: "revision",
    selector: "h1",
    text: "Heading",
    note: "",
    bounds: { x: 10, y: 20, width: 30, height: 40 },
  };
  const host = document.createElement("div");
  const root = createRoot(host);
  function Harness({ text }: { text: string }) {
    useAnnotationMarkers(
      "page",
      "revision",
      [{ ...note, note: text }],
      true,
      vi.fn(),
      "https://example.invalid",
    );
    return null;
  }
  try {
    await act(async () => root.render(<Harness text="first" />));
    expect(previewApi.action).toHaveBeenNthCalledWith(1, "page", {
      kind: "verify_revision",
      expected_revision: "revision",
    });
    expect(previewApi.action).toHaveBeenNthCalledWith(
      2,
      "page",
      expect.objectContaining({ kind: "evaluate" }),
    );
    vi.mocked(previewApi.action).mockClear();
    await act(async () => root.render(<Harness text="edited" />));
    expect(previewApi.action).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    expect(previewApi.action).toHaveBeenCalledExactlyOnceWith(
      "page",
      expect.objectContaining({ kind: "evaluate" }),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
