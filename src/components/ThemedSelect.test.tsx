// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemedSelect } from "./ThemedSelect";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function Picker({
  changed,
  disabled = false,
}: {
  changed: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("system");
  return (
    <ThemedSelect
      aria-label="Scheduler"
      value={value}
      disabled={disabled}
      onChange={(event) => {
        setValue(event.target.value);
        changed(event.target.value);
      }}
    >
      <option value="system">System tasks</option>
      <option value="unavailable" disabled>
        Unavailable
      </option>
      <option value="hermes">Hermes</option>
    </ThemedSelect>
  );
}
async function key(node: Element, value: string) {
  await act(async () =>
    node.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: value,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}

it("opens the themed listbox, skips disabled items and commits one keyboard selection", async () => {
  const changed = vi.fn();
  await act(async () => root.render(<Picker changed={changed} />));
  const trigger =
    container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  trigger.focus();
  expect(container.querySelector("select")?.hidden).toBe(true);
  await key(trigger, "ArrowDown");
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  await key(trigger, "ArrowDown");
  await key(trigger, "Enter");
  expect(changed).toHaveBeenCalledExactlyOnceWith("hermes");
  expect(trigger.textContent).toBe("Hermes");
  expect(document.activeElement).toBe(trigger);
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
it("Escape and outside clicks close without changing the saved value", async () => {
  const changed = vi.fn();
  await act(async () => root.render(<Picker changed={changed} />));
  const trigger =
    container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  await act(async () => trigger.click());
  await key(trigger, "End");
  await key(trigger, "Escape");
  expect(changed).not.toHaveBeenCalled();
  expect(trigger.textContent).toBe("System tasks");
  await act(async () => trigger.click());
  await act(async () =>
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
  );
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
it("mouse selection uses the existing change contract and disabled triggers stay closed", async () => {
  const changed = vi.fn();
  await act(async () => root.render(<Picker changed={changed} />));
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[role="combobox"]')!.click(),
  );
  const option = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
  ].find((node) => node.textContent === "Hermes")!;
  await act(async () => option.click());
  expect(changed).toHaveBeenCalledExactlyOnceWith("hermes");
  await act(async () => root.render(<Picker changed={changed} disabled />));
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[role="combobox"]')!.click(),
  );
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
