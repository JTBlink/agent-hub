// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResizableSidebar } from "./ResizableSidebar";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerWidth", 1000);
  localStorage.clear();
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.documentElement.style.removeProperty("--app-scale");
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () =>
    root.render(
      <ResizableSidebar storageKey="test-width" label="Files">
        <p>Tree</p>
      </ResizableSidebar>,
    ),
  );
const handle = () => host.querySelector<HTMLElement>('[role="separator"]')!;
async function pointer(type: string, x: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  await act(async () => handle().dispatchEvent(event));
}
async function key(value: string) {
  await act(async () =>
    handle().dispatchEvent(
      new KeyboardEvent("keydown", { key: value, bubbles: true }),
    ),
  );
}
it("resizes in logical pixels, remembers width and restores pointer styles", async () => {
  document.documentElement.style.setProperty("--app-scale", "1.2");
  await render();
  await pointer("pointerdown", 100);
  expect(document.body.style.cursor).toBe("col-resize");
  await pointer("pointermove", 172);
  expect(handle().getAttribute("aria-valuenow")).toBe("340");
  await pointer("pointerup", 172);
  expect(document.body.style.cursor).toBe("");
  expect(localStorage.getItem("test-width")).toBe("340");
  await act(async () => root.unmount());
  root = createRoot(host);
  await render();
  expect(handle().getAttribute("aria-valuenow")).toBe("340");
});
it("supports keyboard sizing and reset, and leaves room for content in narrow windows", async () => {
  await render();
  await key("End");
  expect(handle().getAttribute("aria-valuenow")).toBe("600");
  await key("Home");
  await key("ArrowRight");
  expect(handle().getAttribute("aria-valuenow")).toBe("190");
  await act(async () =>
    handle().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
  );
  expect(handle().getAttribute("aria-valuenow")).toBe("280");
  vi.stubGlobal("innerWidth", 480);
  await act(async () => window.dispatchEvent(new Event("resize")));
  expect(handle().getAttribute("aria-valuenow")).toBe("160");
  expect(handle().getAttribute("aria-valuemax")).toBe("160");
});
it("ignores corrupt stored widths and cleans up a drag when unmounted", async () => {
  localStorage.setItem("test-width", "not-a-number");
  await render();
  expect(handle().getAttribute("aria-valuenow")).toBe("280");
  await pointer("pointerdown", 100);
  await act(async () => root.unmount());
  root = createRoot(host);
  expect(document.body.style.cursor).toBe("");
  expect(document.body.style.userSelect).toBe("");
});

it("keeps mounted panels at the same user width when switching their content", async () => {
  const renderPanels = (gitVisible: boolean) =>
    act(async () =>
      root.render(
        <>
          <ResizableSidebar
            storageKey="shared-width"
            label="Files"
            hidden={gitVisible}
          >
            <p>Files</p>
          </ResizableSidebar>
          <ResizableSidebar
            storageKey="shared-width"
            label="Git"
            hidden={!gitVisible}
          >
            <p>Changes</p>
          </ResizableSidebar>
        </>,
      ),
    );
  await renderPanels(false);
  await pointer("pointerdown", 100);
  await pointer("pointermove", 160);
  await pointer("pointerup", 160);
  await renderPanels(true);
  const separators = host.querySelectorAll<HTMLElement>('[role="separator"]');
  expect(separators[1].getAttribute("aria-valuenow")).toBe("340");
  await act(async () =>
    separators[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  await renderPanels(false);
  expect(separators[0].getAttribute("aria-valuenow")).toBe("350");
  expect(localStorage.getItem("shared-width")).toBe("350");
});

it("resizes a right sidebar from its left edge and resets its saved width", async () => {
  await act(async () =>
    root.render(
      <ResizableSidebar
        side="right"
        storageKey="preview-width"
        label="Annotations"
        defaultWidth={300}
      >
        <p>Feedback</p>
      </ResizableSidebar>,
    ),
  );
  await pointer("pointerdown", 700);
  await pointer("pointermove", 620);
  await pointer("pointerup", 620);
  expect(handle().getAttribute("aria-valuenow")).toBe("380");
  expect(localStorage.getItem("preview-width")).toBe("380");
  await key("ArrowLeft");
  expect(handle().getAttribute("aria-valuenow")).toBe("390");
  await key("ArrowRight");
  expect(handle().getAttribute("aria-valuenow")).toBe("380");
  await act(async () =>
    handle().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
  );
  expect(handle().getAttribute("aria-valuenow")).toBe("300");
});
