// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Tag } from "./Tag";

it("renders a static label without introducing a focusable button", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<Tag title="Full label">build</Tag>));
  expect(host.textContent).toBe("build");
  expect(host.firstElementChild?.getAttribute("title")).toBe("Full label");
  expect(host.querySelector("button")).toBeNull();
  await act(async () => root.unmount());
});

it("exposes filter selection, forwards interaction and prevents disabled clicks", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  const root = createRoot(host);
  const onClick = vi.fn();
  const onContextMenu = vi.fn();
  await act(async () =>
    root.render(
      <Tag selected={false} onClick={onClick} onContextMenu={onContextMenu}>
        build
      </Tag>,
    ),
  );
  const button = host.querySelector("button")!;
  expect(button.type).toBe("button");
  expect(button.getAttribute("aria-pressed")).toBe("false");
  await act(async () => {
    button.click();
    button.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
  });
  expect(onClick).toHaveBeenCalledOnce();
  expect(onContextMenu).toHaveBeenCalledOnce();
  await act(async () =>
    root.render(
      <Tag selected disabled onClick={onClick}>
        build
      </Tag>,
    ),
  );
  expect(button.getAttribute("aria-pressed")).toBe("true");
  await act(async () => button.click());
  expect(onClick).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});
