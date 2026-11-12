// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HelpTooltip } from "./HelpTooltip";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("opens accessible help by focus, dismisses with Escape, and does not toggle its details", async () => {
  await act(async () =>
    root.render(
      <details>
        <summary>
          Advanced <HelpTooltip label="Usage">Optional arguments</HelpTooltip>
        </summary>
      </details>,
    ),
  );
  const button = host.querySelector("button")!;
  await act(async () => button.focus());
  const tooltip = document.querySelector('[role="tooltip"]')!;
  expect(tooltip.textContent).toBe("Optional arguments");
  expect(button.getAttribute("aria-describedby")).toBe(tooltip.id);
  expect(host.contains(tooltip)).toBe(false);
  await act(async () => button.click());
  expect(host.querySelector("details")!.open).toBe(false);
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  expect(button.hasAttribute("aria-describedby")).toBe(false);
});
it("opens on pointer hover and closes after leaving or clicking outside", async () => {
  vi.useFakeTimers();
  try {
    await act(async () =>
      root.render(<HelpTooltip label="Usage">Help</HelpTooltip>),
    );
    const button = host.querySelector("button")!;
    await act(async () =>
      button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })),
    );
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    await act(async () =>
      button.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })),
    );
    await act(async () => vi.advanceTimersByTime(160));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => button.click());
    await act(async () =>
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      ),
    );
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
