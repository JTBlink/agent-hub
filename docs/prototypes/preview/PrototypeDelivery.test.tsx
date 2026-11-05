// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { usePreviewModel } from "./usePreviewModel";
import { PrototypeDelivery } from "./PrototypeDelivery";
it("previews the file packet and reuses its sandbox tab for successive sends", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  let model!: ReturnType<typeof usePreviewModel>;
  function Harness() {
    const current = usePreviewModel();
    useEffect(() => {
      model = current;
    });
    return <PrototypeDelivery model={current} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(container.querySelector('[role="combobox"]')).not.toBeNull();
    await act(async () => model.setPrompt("Change the selected button"));
    const packet = container.querySelector("pre")!.textContent;
    expect(packet).toContain("File: /workspace/examples/preview.html");
    expect(packet).not.toContain("workspace://");
    await act(async () =>
      container.querySelector<HTMLButtonElement>("button.pv-primary")!.click(),
    );
    await act(async () => model.setPrompt("Keep the existing spacing"));
    await act(async () =>
      container.querySelector<HTMLButtonElement>("button.pv-primary")!.click(),
    );
    expect(Object.keys(model.agentTabs)).toEqual([
      "/workspace/examples/preview.html",
    ]);
    expect(model.agentTabs["/workspace/examples/preview.html"]).toEqual([
      packet,
      expect.stringContaining("Keep the existing spacing"),
    ]);
    await act(async () => model.selectTab(model.tabs[1]));
    await act(async () =>
      container.querySelector<HTMLButtonElement>("button.pv-primary")!.click(),
    );
    expect(Object.keys(model.agentTabs)).toHaveLength(2);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
