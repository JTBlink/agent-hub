// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import i18n from "../i18n";
import { AutomationVariablesField } from "./AutomationVariablesField";
import type { AutomationVariable } from "../lib/automationPrompts";

let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await i18n.changeLanguage("zh");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function Fixture({
  disabled = false,
  explicit = false,
}: {
  disabled?: boolean;
  explicit?: boolean;
}) {
  const [variables, onChange] = useState<AutomationVariable[]>([
    {
      name: "scope",
      value: "own",
      description: "own: current account; all: every author",
      ...(explicit ? { options: ["own", "all"] } : {}),
    },
  ]);
  return (
    <>
      <AutomationVariablesField
        variables={variables}
        disabled={disabled}
        onChange={onChange}
      />
      <output>{JSON.stringify(variables)}</output>
    </>
  );
}
const trigger = () =>
  host.querySelector<HTMLButtonElement>('[role="combobox"]')!;
const valueInput = () =>
  host.querySelector<HTMLInputElement>('[aria-label="变量值 1"]')!;
const value = () => JSON.parse(host.querySelector("output")!.textContent!)[0];
async function type(
  field: HTMLInputElement | HTMLTextAreaElement,
  text: string,
) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )!.set!.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("switches one legacy suggestion then accepts custom input without losing choices", async () => {
  await act(async () => root.render(<Fixture />));
  await act(async () => trigger().click());
  const choices = () => [
    ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
  ];
  expect(choices().map((item) => item.textContent)).toEqual(["own", "all"]);
  await act(async () => choices()[1].click());
  expect(valueInput().value).toBe("all");
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(trigger());
  await type(valueInput(), "custom");
  await act(async () => trigger().click());
  expect(choices().map((item) => item.textContent)).toEqual([
    "custom",
    "own",
    "all",
  ]);
  await act(async () =>
    trigger().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(value().value).toBe("custom");
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
it("edits explicit choices immediately, preserves them through value edits and can turn off suggestions", async () => {
  await act(async () => root.render(<Fixture explicit />));
  const options = host.querySelector<HTMLInputElement>(
    '[aria-label="变量候选值 1"]',
  )!;
  await type(options, "one");
  await act(async () =>
    options.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  expect(value().options).toEqual(["own", "all", "one"]);
  await type(valueInput(), "custom");
  expect(value().options).toEqual(["own", "all", "one"]);
  for (const option of ["own", "all", "one"]) {
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          `[aria-label="移除候选值 ${option}"]`,
        )!
        .click(),
    );
  }
  expect(value().options).toEqual([]);
  expect(host.querySelector('[role="combobox"]')).toBeNull();
  expect(value().value).toBe("custom");
});

it("configures multiple suggestions before confirming a new variable and retains pending input on confirmation", async () => {
  await act(async () => root.render(<Fixture />));
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("添加变量"))!
      .click(),
  );
  const name = host.querySelector<HTMLInputElement>(
    '[aria-label="变量名称 2"]',
  )!;
  const options = host.querySelector<HTMLInputElement>(
    '[aria-label="变量候选值 2"]',
  )!;
  expect(options.closest("details")!.open).toBe(true);
  await type(name, "mode");
  await act(async () => {
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { getData: () => "own\nall\nown" },
    });
    options.dispatchEvent(paste);
  });
  expect(host.querySelector('[aria-label="移除候选值 own"]')).not.toBeNull();
  // Unconfirmed candidate input is committed on blur before confirming the row.
  await type(options, "custom");
  await act(async () => options.focus());
  await act(async () => options.blur());
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="确认变量"]')!.click(),
  );
  const variables = JSON.parse(host.querySelector("output")!.textContent!);
  expect(variables[1]).toMatchObject({
    name: "mode",
    options: ["own", "all", "custom"],
  });
  const choice = host.querySelector<HTMLButtonElement>(
    'button[aria-label="选择变量值 2"]',
  )!;
  await act(async () => choice.click());
  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
      .find((option) => option.textContent === "all")!
      .click(),
  );
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="变量值 2"]')!.value,
  ).toBe("all");
});
it("supports keyboard switching, outside dismissal and disabled controls", async () => {
  await act(async () => root.render(<Fixture />));
  for (const key of ["ArrowDown", "End", "Enter"]) {
    await act(async () =>
      trigger().dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      ),
    );
  }
  expect(value().value).toBe("all");
  await act(async () => trigger().click());
  await act(async () =>
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
  );
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  await act(async () => root.render(<Fixture disabled />));
  expect(valueInput().disabled).toBe(true);
  expect(trigger().disabled).toBe(true);
  await act(async () => trigger().click());
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
