// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { usePreviewModel } from "./usePreviewModel";
import { HtmlExamplePage, htmlExampleDocument } from "./PrototypeExamples";
it("clears selected DOM context after navigation and history changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let model: ReturnType<typeof usePreviewModel> | undefined;
  function Harness() {
    const current = usePreviewModel();
    useEffect(() => {
      model = current;
    });
    return null;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  const button = document.createElement("button");
  button.id = "example-action";
  button.textContent = "Example";
  document.body.append(button);
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => model!.grab(button));
    expect(model!.current?.selector).toBe("#example-action");
    await act(async () => model!.navigate("http://localhost:3000/next"));
    expect(model!.pageCaptures).toHaveLength(0);
    expect(model!.current).toBeUndefined();
    expect(model!.selected).toBeNull();
    await act(async () => model!.go(-1));
    expect(model!.pageCaptures).toHaveLength(1);
    expect(model!.current).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    button.remove();
    vi.unstubAllGlobals();
  }
});
it("exports the same ordinary HTML example content and layout without account markup", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<HtmlExamplePage />));
    const parsed = new DOMParser().parseFromString(
      htmlExampleDocument,
      "text/html",
    );
    expect(parsed.querySelector("#preview-action")?.textContent).toBe(
      container.querySelector("#preview-action")?.textContent,
    );
    expect(parsed.querySelector("h1")?.textContent).toBe(
      container.querySelector("h1")?.textContent,
    );
    expect(parsed.querySelector("style")?.textContent).toContain(
      ".pv-html-example-card",
    );
    expect(htmlExampleDocument).not.toMatch(/账户|登录|account|login/i);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
