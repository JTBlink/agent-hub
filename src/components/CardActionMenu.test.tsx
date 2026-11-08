// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CardActionMenu } from "./CardActionMenu";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.documentElement.style.removeProperty("--app-scale");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function key(node: Element, key: string) {
  await act(async () =>
    node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })),
  );
}
const items = () => [
  ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
];

it("navigates enabled actions by keyboard, cancels and restores the trigger focus", async () => {
  const select = vi.fn();
  await act(async () =>
    root.render(
      <CardActionMenu
        label="More"
        actions={[
          { key: "first", label: "First", icon: null, onSelect: select },
          {
            key: "disabled",
            label: "Disabled",
            icon: null,
            disabled: true,
            onSelect: select,
          },
          { key: "last", label: "Last", icon: null, onSelect: select },
        ]}
      />,
    ),
  );
  const trigger = container.querySelector("button")!;
  await key(trigger, "ArrowDown");
  expect(document.activeElement).toBe(items()[0]);
  await key(items()[0], "ArrowDown");
  expect(document.activeElement).toBe(items()[2]);
  await key(items()[2], "Home");
  expect(document.activeElement).toBe(items()[0]);
  await key(items()[0], "End");
  expect(document.activeElement).toBe(items()[2]);
  await key(items()[2], "Escape");
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(select).not.toHaveBeenCalled();
  await act(async () => trigger.click());
  await act(async () => items()[2].click());
  expect(select).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("anchors the portal at enlarged text size and follows viewport changes", async () => {
  document.documentElement.style.setProperty("--app-scale", "1.2");
  await act(async () =>
    root.render(
      <CardActionMenu
        label="More"
        actions={[
          { key: "restore", label: "Restore", icon: null, onSelect: vi.fn() },
        ]}
      />,
    ),
  );
  const trigger = container.querySelector("button")!;
  const rect = { bottom: 120, right: 240 };
  vi.spyOn(trigger, "getBoundingClientRect").mockImplementation(() =>
    DOMRect.fromRect({
      x: rect.right - 24,
      y: rect.bottom - 24,
      width: 24,
      height: 24,
    }),
  );
  await act(async () => trigger.click());
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  expect(Number.parseFloat(menu.style.top) * 1.2).toBeCloseTo(124.8);
  expect(Number.parseFloat(menu.style.right) * 1.2).toBeCloseTo(
    window.innerWidth - rect.right,
  );
  rect.bottom = 180;
  await act(async () => window.dispatchEvent(new Event("scroll")));
  expect(Number.parseFloat(menu.style.top) * 1.2).toBeCloseTo(184.8);
  await act(async () =>
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
  );
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("keeps a wide menu inside the viewport when its trigger is near the left edge", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return this.getAttribute("role") === "menu"
        ? DOMRect.fromRect({ width: 420, height: 140 })
        : DOMRect.fromRect({
            x: 8,
            y: window.innerHeight - 32,
            width: 180,
            height: 24,
          });
    },
  );
  await act(async () =>
    root.render(
      <CardActionMenu
        label="Branches"
        actions={[
          {
            key: "long",
            label: "feature/a-very-long-branch-name",
            onSelect: vi.fn(),
          },
        ]}
      />,
    ),
  );
  await act(async () => container.querySelector("button")!.click());
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  expect(window.innerWidth - Number.parseFloat(menu.style.right) - 420).toBe(8);
  expect(Number.parseFloat(menu.style.top) + 140).toBeLessThanOrEqual(
    window.innerHeight - 8,
  );
});

it("enters a checked submenu, cancels one level and returns selection to the root trigger", async () => {
  const select = vi.fn();
  await act(async () =>
    root.render(
      <CardActionMenu
        label="Options"
        actions={[
          {
            key: "sort",
            label: "Sort",
            submenu: [
              {
                key: "disabled",
                label: "Disabled",
                disabled: true,
                onSelect: select,
              },
              { key: "name", label: "Name", checked: true, onSelect: select },
              { key: "date", label: "Date", checked: false, onSelect: select },
            ],
          },
          { key: "refresh", label: "Refresh", onSelect: select },
        ]}
      />,
    ),
  );
  const trigger = container.querySelector("button")!;
  await act(async () => trigger.click());
  const sort = items()[0];
  const enter = async () => {
    await key(sort, "ArrowRight");
    await act(
      async () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  };
  await enter();
  expect(document.activeElement?.textContent).toBe("Name");
  expect(document.activeElement?.getAttribute("aria-checked")).toBe("true");
  await key(document.activeElement!, "End");
  expect(document.activeElement?.textContent).toBe("Date");
  await key(document.activeElement!, "Escape");
  expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
  expect(document.activeElement).toBe(sort);
  expect(select).not.toHaveBeenCalled();
  await key(sort, "End");
  expect(document.activeElement?.textContent).toBe("Refresh");
  await key(document.activeElement!, "Home");
  await enter();
  await key(document.activeElement!, "ArrowLeft");
  expect(document.activeElement).toBe(sort);
  await enter();
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect(select).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
