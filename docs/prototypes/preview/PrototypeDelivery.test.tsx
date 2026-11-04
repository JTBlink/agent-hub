// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { usePreviewModel } from "./usePreviewModel";
import { PrototypeDelivery } from "./PrototypeDelivery";

it("requires session, workspace and Agent, retains failed feedback and delivers to the selected sandbox", async () => {
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
  const select = async (index: number, value: string) =>
    act(async () => {
      const element = container.querySelectorAll("select")[index];
      element.value = value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
  const button = () =>
    container.querySelector<HTMLButtonElement>("button.pv-primary")!;
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => model.setPrompt("Change the selected button"));
    expect(button().disabled).toBe(true);
    await select(1, "default");
    await select(2, "web");
    await select(3, "codex-1");
    expect(button().disabled).toBe(false);
    expect(container.textContent).toContain(
      "default → Web · ~/projects/web → codex-1",
    );
    await act(async () =>
      container
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .click(),
    );
    await act(async () => button().click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "批注已保留",
    );
    expect(model.prompt).toBe("Change the selected button");
    expect(model.agentLog).toEqual([]);
    await select(1, "review");
    expect(button().disabled).toBe(true);
    expect(container.querySelectorAll("select")[3].value).toBe("");
    await select(2, "review-web");
    await select(3, "codex-1");
    await act(async () =>
      container
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .click(),
    );
    await act(async () => button().click());
    expect(model.agentLog[0]).toContain(
      "review → Web · ~/projects/web-review → codex-1",
    );
    expect(model.agentLog[0]).toContain("Change the selected button");
    expect(model.variant).toBe("C");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
