// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { usePreviewModel } from "./usePreviewModel";
import { HtmlExamplePage, htmlExampleDocument } from "./PrototypeExamples";
async function mountModel() {
  let model: ReturnType<typeof usePreviewModel> | undefined;
  function Harness() {
    const current = usePreviewModel();
    useEffect(() => {
      model = current;
    });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
  return {
    get model() {
      return model!;
    },
    unmount: () => act(async () => root.unmount()),
  };
}
it("clears selected DOM context after navigation and history changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = await mountModel();
  const button = document.createElement("button");
  button.id = "example-action";
  button.textContent = "Example";
  document.body.append(button);
  try {
    await act(async () => fixture.model.selectTab(fixture.model.tabs[0]));
    await act(async () => fixture.model.grab(button));
    expect(fixture.model.current?.selector).toBe("#example-action");
    await act(async () => fixture.model.navigate("http://localhost:3000/next"));
    expect(fixture.model.pageCaptures).toHaveLength(0);
    expect(fixture.model.current).toBeUndefined();
    expect(fixture.model.selected).toBeNull();
    await act(async () => fixture.model.go(-1));
    expect(fixture.model.pageCaptures).toHaveLength(1);
    expect(fixture.model.current).toBeUndefined();
  } finally {
    await fixture.unmount();
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
it("keeps capture-copy separate from annotation feedback", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const fixture = await mountModel();
  const button = document.createElement("button");
  button.id = "example-action";
  button.textContent = "Example";
  document.body.append(button);
  try {
    expect(fixture.model.libraryOpen).toBe(false);
    expect(fixture.model.panelOpen).toBe(false);
    await act(async () => fixture.model.startPicking("copy"));
    await act(async () => fixture.model.pickElement(button));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('id="example-action"'),
    );
    expect(fixture.model.captures).toHaveLength(0);
    expect(fixture.model.picking).toBe(true);
    expect(fixture.model.panelOpen).toBe(false);
    await act(async () => fixture.model.startPicking("annotate"));
    await act(async () => fixture.model.pickElement(button));
    expect(fixture.model.captures).toHaveLength(1);
    expect(fixture.model.picking).toBe(false);
    expect(fixture.model.panelOpen).toBe(true);
  } finally {
    await fixture.unmount();
    button.remove();
    vi.unstubAllGlobals();
  }
});

it("opens a webpage from a document in a separate browser tab", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = await mountModel();
  try {
    const documentTab = fixture.model.active!;
    await act(async () => fixture.model.navigate("https://example.invalid/"));
    expect(fixture.model.active?.kind).toBe("web");
    expect(fixture.model.active?.url).toBe("https://example.invalid/");
    expect(fixture.model.tabs.find((tab) => tab.id === documentTab.id)).toEqual(
      documentTab,
    );
    await act(async () => fixture.model.selectTab(documentTab));
    expect(fixture.model.active?.kind).toBe("html");
    expect(fixture.model.active?.url).toBe(documentTab.url);
  } finally {
    await fixture.unmount();
    vi.unstubAllGlobals();
  }
});
