// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VerticalSplit } from "./VerticalSplit";
let host: HTMLDivElement, root: Root, availableHeight: number;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  availableHeight = 601;
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    () => availableHeight,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.documentElement.style.removeProperty("--app-scale");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const render = (bottomCollapsed = false) =>
  act(async () =>
    root.render(
      <VerticalSplit
        top={<p>Changes</p>}
        bottom={<p>History</p>}
        bottomCollapsed={bottomCollapsed}
        storageKey="test-git-split"
        label="Resize panels"
        hint="Drag to resize"
      />,
    ),
  );
const handle = () => host.querySelector<HTMLElement>('[role="separator"]')!;
async function pointer(type: string, y: number) {
  const element = handle();
  element.setPointerCapture = vi.fn();
  element.hasPointerCapture = () => true;
  element.releasePointerCapture = vi.fn();
  const event = new MouseEvent(type, { bubbles: true, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  await act(async () => element.dispatchEvent(event));
}
async function key(key: string) {
  await act(async () =>
    handle().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    ),
  );
}
it("drags in scaled coordinates, remembers the proportion and restores the cursor on cancel or unmount", async () => {
  document.documentElement.style.setProperty("--app-scale", "1.2");
  await render();
  expect(handle().getAttribute("aria-valuenow")).toBe("60");
  await pointer("pointerdown", 100);
  expect(document.body.style.cursor).toBe("row-resize");
  expect(document.body.style.userSelect).toBe("none");
  await pointer("pointermove", 172);
  expect(handle().getAttribute("aria-valuenow")).toBe("70");
  await pointer("pointercancel", 172);
  expect(document.body.style.cursor).toBe("");
  expect(document.body.style.userSelect).toBe("");
  expect(Number(localStorage.getItem("test-git-split"))).toBeCloseTo(0.7);
  await act(async () => root.unmount());
  root = createRoot(host);
  await render();
  expect(handle().getAttribute("aria-valuenow")).toBe("70");
  await pointer("pointerdown", 100);
  await act(async () => root.unmount());
  root = createRoot(host);
  expect(document.body.style.cursor).toBe("");
});
it("keeps both panels reachable, supports keyboard and reset, and disables resizing when history is collapsed", async () => {
  localStorage.setItem("test-git-split", "invalid");
  await render();
  await key("End");
  expect(handle().getAttribute("aria-valuenow")).toBe("83");
  await key("Home");
  expect(handle().getAttribute("aria-valuenow")).toBe("23");
  await key("ArrowDown");
  expect(handle().getAttribute("aria-valuenow")).toBe("25");
  await act(async () =>
    handle().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
  );
  expect(handle().getAttribute("aria-valuenow")).toBe("60");
  await render(true);
  expect(handle().getAttribute("aria-disabled")).toBe("true");
  expect(handle().tabIndex).toBe(-1);
  await key("Home");
  expect(handle().getAttribute("aria-valuenow")).toBe("60");
  await render(false);
  availableHeight = 201;
  await act(async () => window.dispatchEvent(new Event("resize")));
  expect(handle().getAttribute("aria-valuenow")).toBe("60");
  expect(handle().getAttribute("aria-valuemin")).toBe("60");
  expect(handle().getAttribute("aria-valuemax")).toBe("60");
});
