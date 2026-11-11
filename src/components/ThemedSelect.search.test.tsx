// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemedSelect } from "./ThemedSelect";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const trigger = () => host.querySelector<HTMLButtonElement>("button")!;
const input = () =>
  document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
const options = () => [
  ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
];
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function key(value: string, composing = false) {
  const event = new KeyboardEvent("keydown", {
    key: value,
    isComposing: composing,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => input().dispatchEvent(event));
  return event;
}
async function render(changed = vi.fn()) {
  function Picker() {
    const [value, setValue] = useState("main");
    return (
      <ThemedSelect
        value={value}
        aria-label="Branches"
        search={{
          placeholder: "Filter branches",
          clear: "Clear search",
          noResults: "No matches",
        }}
        onChange={(event) => {
          setValue(event.target.value);
          changed(event.target.value);
        }}
      >
        <option value="main">main</option>
        <option value="disabled" disabled>
          topic/disabled
        </option>
        <option value="topic">topic/add search</option>
        <option value="remote">origin/topic/add search</option>
      </ThemedSelect>
    );
  }
  await act(async () => root.render(<Picker />));
  await act(async () => trigger().click());
  return changed;
}

it("focuses search, matches case-insensitive substrings and preserves selection until choosing", async () => {
  const changed = await render();
  expect(document.activeElement).toBe(input());
  await type("  ADD SEARCH  ");
  expect(options().map((option) => option.textContent)).toEqual([
    "topic/add search",
    "origin/topic/add search",
  ]);
  expect(trigger().textContent).toBe("main");
  expect(changed).not.toHaveBeenCalled();
  await key("ArrowDown");
  await key("Enter");
  expect(changed).toHaveBeenCalledExactlyOnceWith("remote");
  expect(trigger().textContent).toBe("origin/topic/add search");
  expect(document.activeElement).toBe(trigger());
});

it("shows empty results, safely ignores Enter and clears without changing the selected value", async () => {
  const changed = await render();
  await type("missing");
  expect(options()).toHaveLength(0);
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    "No matches",
  );
  expect(input().hasAttribute("aria-activedescendant")).toBe(false);
  await key("Enter");
  await key("ArrowDown");
  expect(changed).not.toHaveBeenCalled();
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Clear search"]')!
      .click(),
  );
  expect(input().value).toBe("");
  expect(document.activeElement).toBe(input());
  expect(options()).toHaveLength(4);
  expect(changed).not.toHaveBeenCalled();
  await key("Escape");
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(trigger());
});

it("resets search on reopening, skips disabled matches and permits spaces and IME composition", async () => {
  const changed = await render();
  await type("topic");
  expect((await key(" ")).defaultPrevented).toBe(false);
  await key("Enter", true);
  expect(changed).not.toHaveBeenCalled();
  await key("Enter");
  expect(changed).toHaveBeenCalledExactlyOnceWith("topic");
  await act(async () => trigger().click());
  expect(input().value).toBe("");
  expect(options()).toHaveLength(4);
  expect(
    options().find((option) => option.getAttribute("aria-selected") === "true")
      ?.textContent,
  ).toBe("topic/add search");
  await type("missing");
  await key("Tab");
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
