// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { AnnotationPanel } from "./AnnotationPanel";
import { usePreviewWorkspace } from "../usePreviewWorkspace";
import { previewApi } from "../api";
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../api", () => ({
  previewApi: {
    info: vi.fn().mockResolvedValue({ profiles: [] }),
    prepareDelivery: vi.fn().mockResolvedValue({ prompt: "packet" }),
  },
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
    const annotate = host.querySelector<HTMLButtonElement>(
      '[title="preview.annotateElement"]',
    )!;
    const grab = host.querySelector<HTMLButtonElement>(
      '[title="preview.grabElement"]',
    )!;
    vi.mocked(writeText).mockClear();
    vi.mocked(toast.success).mockClear();
    await act(async () => grab.click());
    expect(grab.getAttribute("aria-pressed")).toBe("true");
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-add]")!.click(),
    );
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("Note 1"),
    );
    expect(toast.success).toHaveBeenCalledExactlyOnceWith("preview.copied");
    expect(rows()).toHaveLength(0);
    expect(grab.getAttribute("aria-pressed")).toBe("false");
    vi.mocked(writeText).mockRejectedValueOnce(Error("clipboard unavailable"));
    await act(async () => grab.click());
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-add]")!.click(),
    );
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(0);
    await act(async () => annotate.click());
    expect(annotate.getAttribute("aria-pressed")).toBe("true");
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-add]")!.click(),
    );
    expect(annotate.getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(
      host.querySelector(".preview-note textarea"),
    );
    expect(writeText).toHaveBeenCalledTimes(2);
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-add]")!.click(),
    );
    expect(rows()).toHaveLength(2);
    expect([...rows()].map((row) => row.getAttribute("aria-expanded"))).toEqual(
      ["false", "true"],
    );
    expect(rows()[0].textContent).toBe("1Note 1");
    expect(rows()[1].textContent).toBe("2Note 2");
    expect(host.querySelectorAll(".preview-annotation-delete")).toHaveLength(2);
    await act(async () => rows()[0].click());
    expect([...rows()].map((row) => row.getAttribute("aria-expanded"))).toEqual(
      ["true", "false"],
    );
    await act(async () => rows()[0].click());
    await act(async () => rows()[1].click());
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(".preview-annotation-delete")!
        .click(),
    );
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toBe("1Note 2");
    expect(rows()[0].getAttribute("aria-expanded")).toBe("true");
    await act(async () => rows()[0].click());
    expect([...rows()].map((row) => row.getAttribute("aria-expanded"))).toEqual(
      ["false"],
    );
    expect(host.querySelectorAll(".preview-note")).toHaveLength(0);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(".preview-annotation-delete")!
        .click(),
    );
    expect(rows()).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it.each(["success", "failure", "copy", "new context"])(
  "%s delivery only clears the successfully sent draft",
  async (outcome) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let model!: ReturnType<typeof usePreviewWorkspace>;
    let finish!: () => void;
    const deliver = vi.fn(() => {
      if (outcome === "failure") return Promise.reject(Error("send failed"));
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const adapter = {
      id: "test",
      label: "Agent",
      resolveCurrent: vi.fn(async () => ({ send: deliver })),
    };
    function Harness() {
      const current = usePreviewWorkspace({
        isolated: true,
        initialDocument: {
          id: "doc",
          kind: "markdown",
          title: "Example",
          path: "/workspace/site/index.md",
          revision: "one",
          content: "# Example",
        },
      });
      useEffect(() => {
        model = current;
      });
      return (
        <AnnotationPanel
          model={current}
          onDraw={() => {}}
          deliveryAdapter={outcome === "copy" ? undefined : adapter}
        />
      );
    }
    try {
      await act(async () => root.render(<Harness />));
      await act(async () => {
        model.capture(model.active!.id, {
          selector: "h1",
          text: "Sent context",
        });
        model.setInstruction("Change the heading");
      });
      const sentId = model.notes[0].id;
      await act(async () =>
        model.setSession((previous) => ({
          ...previous,
          annotations: previous.annotations.map((note) => ({
            ...note,
            screenshot: "screenshot-data",
          })),
        })),
      );
      await act(async () =>
        host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(),
      );
      if (outcome !== "copy") {
        expect(adapter.resolveCurrent).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({
            title: "Example",
            path: "/workspace/site/index.md",
          }),
        );
      }
      if (outcome === "new context") {
        await act(async () => {
          model.capture(model.active!.id, {
            selector: "p",
            text: "Unsent context",
          });
          model.setInstruction("New request");
        });
      }
      if (outcome === "success" || outcome === "new context") {
        expect(model.notes.some((note) => note.id === sentId)).toBe(true);
        await act(async () => finish());
        expect(model.notes.some((note) => note.id === sentId)).toBe(false);
        expect(model.instruction).toBe(
          outcome === "new context" ? "New request" : "",
        );
        expect(
          host.querySelector<HTMLTextAreaElement>(
            'textarea[aria-label="preview.changeRequest"]',
          )!.value,
        ).toBe(model.instruction);
        expect(host.querySelectorAll(".preview-context-chip")).toHaveLength(
          outcome === "new context" ? 1 : 0,
        );
        expect(host.querySelector(".preview-delivery-content img")).toBeNull();
        expect(
          host.querySelector<HTMLButtonElement>('button[type="submit"]')!
            .disabled,
        ).toBe(outcome === "success");
      } else {
        expect(model.notes[0].screenshot).toBe("screenshot-data");
        expect(model.instruction).toBe("Change the heading");
        if (outcome === "failure")
          expect(host.querySelector('[role="alert"]')?.textContent).toContain(
            "send failed",
          );
      }
      expect(previewApi.prepareDelivery).toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  },
);
