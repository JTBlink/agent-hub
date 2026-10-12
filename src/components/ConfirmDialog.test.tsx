// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import { ConfirmDialog } from "./ConfirmDialog";

const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
const t = i18n.t.bind(i18n);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
const onConfirm = vi.fn();
let container: HTMLDivElement;
let root: Root;
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <ConfirmDialog
        open={open}
        message="Replace local changes"
        confirmLabel="restore"
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
      />
    </>
  );
}
beforeEach(async () => {
  onConfirm.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function button(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === label,
  )!;
}
async function open() {
  button("open").focus();
  await act(async () => button("open").click());
}

it("starts on cancel, traps keyboard focus, and returns focus after Escape", async () => {
  await open();
  expect(document.activeElement).toBe(button("取消"));
  button("restore").focus();
  await act(async () =>
    button("restore").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    t("common.close"),
  );
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
  );
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.activeElement).toBe(button("open"));
});

it("consumes Escape before it reaches the underlying detail or selection view", async () => {
  const underlyingEscape = vi.fn();
  window.addEventListener("keydown", underlyingEscape);
  try {
    await open();
    await act(async () =>
      button("取消").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(underlyingEscape).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  } finally {
    window.removeEventListener("keydown", underlyingEscape);
  }
});
it("does not allow closing or a second confirmation while the write is pending", async () => {
  let resolve: () => void = () => {};
  onConfirm.mockReturnValueOnce(
    new Promise<void>((done) => {
      resolve = done;
    }),
  );
  await open();
  await act(async () => {
    button("restore").click();
    button("restore").click();
  });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(button("取消").disabled).toBe(true);
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    button("取消").click();
    container.querySelector<HTMLElement>(".absolute.inset-0")?.click();
  });
  expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
  await act(async () => resolve());
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
});
it("retains failed confirmations for retry", async () => {
  onConfirm.mockResolvedValueOnce(false);
  await open();
  await act(async () => button("restore").click());
  expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(button("restore").disabled).toBe(false);
  await act(async () => button("restore").click());
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
});
