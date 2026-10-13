// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSettingsForm } from "./useSettingsForm";
import { SettingsForm } from "../components/settings/SettingsForm";
const io = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  io.load.mockResolvedValue("stored");
  io.save.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function Subject({ locale = "zh" }: { locale?: string }) {
  const [value, setValue] = useState("initial");
  const form = useSettingsForm(io.load, setValue);
  return (
    <div lang={locale}>
      <SettingsForm form={form}>
        <input
          aria-label="Setting"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          onClick={() =>
            void form.save(async () => {
              await io.save(value);
              setValue("saved");
            })
          }
        >
          Save
        </button>
      </SettingsForm>
    </div>
  );
}
const input = () => container.querySelector<HTMLInputElement>("input")!;
const button = () =>
  container.querySelector<HTMLButtonElement>("fieldset button")!;

it("disables edits until the initial read completes, then preserves drafts across parent changes", async () => {
  let finish: ((value: string) => void) | undefined;
  io.load.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => root.render(<Subject />));
  expect(input().matches(":disabled")).toBe(true);
  await act(async () => finish?.("stored"));
  expect(input().matches(":disabled")).toBe(false);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(input(), "unsaved");
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => root.render(<Subject locale="en" />));
  expect(input().value).toBe("unsaved");
  expect(io.load).toHaveBeenCalledOnce();
});
it("keeps failed reads disabled and provides a working retry", async () => {
  io.load.mockRejectedValue(new Error("read failed"));
  await act(async () => root.render(<Subject />));
  expect(input().matches(":disabled")).toBe(true);
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  io.load.mockResolvedValue("recovered");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[role="alert"] button')!
      .click(),
  );
  expect(input().value).toBe("recovered");
  expect(input().matches(":disabled")).toBe(false);
});
it("blocks repeat saves and preserves the current value after failure", async () => {
  let fail: ((error: unknown) => void) | undefined;
  io.save.mockImplementation(
    () =>
      new Promise<void>((_, reject) => {
        fail = reject;
      }),
  );
  await act(async () => root.render(<Subject />));
  await act(async () => {
    button().click();
    button().click();
  });
  expect(io.save).toHaveBeenCalledOnce();
  expect(input().matches(":disabled")).toBe(true);
  await act(async () => fail?.(new Error("write failed")));
  expect(input().value).toBe("stored");
  expect(input().matches(":disabled")).toBe(false);
  expect(toast.error).toHaveBeenCalledOnce();
});
