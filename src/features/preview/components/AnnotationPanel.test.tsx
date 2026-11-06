// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AnnotationPanel } from "./AnnotationPanel";
import { usePreviewWorkspace } from "../usePreviewWorkspace";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../api", () => ({
  previewApi: { info: vi.fn().mockResolvedValue({ profiles: [] }) },
}));
vi.mock("../../../lib/tauri", () => ({
  getSettings: vi.fn().mockResolvedValue(null),
  setSettings: vi.fn().mockResolvedValue(undefined),
}));
it("keeps one summary row per annotation, expands the newest by default and expands only the selected row", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const model = usePreviewWorkspace({
      isolated: true,
      initialDocument: {
        id: "doc",
        kind: "markdown",
        title: "Example",
        revision: "one",
        content: "# Example",
      },
    });
    return (
      <>
        <button
          data-add
          onClick={() =>
            model.capture(model.active!.id, {
              selector: "h1",
              text: `Note ${model.notes.length + 1}`,
            })
          }
        >
          Add
        </button>
        <AnnotationPanel model={model} onDraw={() => {}} />
      </>
    );
  }
  const rows = () =>
    host.querySelectorAll<HTMLButtonElement>(".preview-annotation-summary");
  try {
    await act(async () => root.render(<Harness />));
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-add]")!.click(),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-add]")!.click(),
    );
    expect(rows()).toHaveLength(2);
    expect([...rows()].map((row) => row.getAttribute("aria-expanded"))).toEqual(
      ["false", "true"],
    );
    expect(rows()[0].textContent).toBe("1Note 1");
    expect(rows()[1].textContent).toBe("2Note 2");
    await act(async () => rows()[0].click());
    expect([...rows()].map((row) => row.getAttribute("aria-expanded"))).toEqual(
      ["true", "false"],
    );
    expect(host.querySelectorAll(".preview-note")).toHaveLength(1);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(".preview-note header button")!
        .click(),
    );
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toBe("1Note 2");
    expect(rows()[0].getAttribute("aria-expanded")).toBe("true");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
