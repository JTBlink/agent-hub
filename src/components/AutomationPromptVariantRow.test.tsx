// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import zh from "../i18n/zh.json";
import { AutomationPromptVariantRow } from "./AutomationPromptVariantRow";

const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));

it("renames inline from the context menu, commits once, cancels Escape and blocks disabled actions", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const rename = vi.fn();
  function Harness({ disabled = false }: { disabled?: boolean }) {
    const [name, setName] = useState("Review");
    return (
      <AutomationPromptVariantRow
        variant={{ id: "review", name, content: "Review only" }}
        viewed
        active
        disabled={disabled}
        canDelete={false}
        group="prompts"
        onView={() => {}}
        onActivate={() => {}}
        onRemove={() => {}}
        onRename={(value) => {
          rename(value);
          setName(value);
        }}
      />
    );
  }
  const openRename = async () => {
    await act(async () =>
      host
        .querySelector("button[aria-pressed]")!
        .dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
        ),
    );
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click(),
    );
    return host.querySelector<HTMLInputElement>(
      'input[aria-label="方案名称"]',
    )!;
  };
  const type = async (input: HTMLInputElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  try {
    await act(async () => root.render(<Harness />));
    let input = await openRename();
    expect(document.activeElement).toBe(input);
    expect(input.selectionEnd).toBe("Review".length);
    expect(
      document.querySelector('[role="dialog"], [role="alertdialog"]'),
    ).toBeNull();
    await type(input, "  Repair  ");
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: true,
          bubbles: true,
        }),
      ),
    );
    expect(rename).not.toHaveBeenCalled();
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(rename).toHaveBeenCalledExactlyOnceWith("Repair");
    expect(
      host.querySelector('input[type="radio"]:checked')?.getAttribute("value"),
    ).toBe("review");
    expect(document.activeElement).toBe(
      host.querySelector("button[aria-pressed]"),
    );
    input = await openRename();
    await type(input, "Discard");
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(rename).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Repair");
    input = await openRename();
    await type(input, "New name");
    await act(async () => input.blur());
    expect(rename).toHaveBeenLastCalledWith("New name");
    await act(async () => root.render(<Harness disabled />));
    await act(async () =>
      host
        .querySelector("button[aria-pressed]")!
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })),
    );
    expect(document.querySelector('[role="menu"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
