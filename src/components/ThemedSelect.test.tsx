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
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
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

it("invokes a row action with the keyboard without selecting its option", async () => {
  const changed = vi.fn();
  const remove = vi.fn();
  await act(async () =>
    root.render(
      <ThemedSelect
        aria-label="Projects"
        value="one"
        onChange={changed}
        optionAction={(value) => ({
          label: `Remove ${value}`,
          icon: "×",
          onSelect: () => remove(value),
        })}
      >
        <option value="one">One</option>
        <option value="two">Two</option>
      </ThemedSelect>,
    ),
  );
  const trigger =
    container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  trigger.focus();
  await key(trigger, "ArrowDown");
  await key(trigger, "ArrowDown");
  await key(trigger, "Tab");
  const action = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove two"]',
  )!;
  expect(document.activeElement).toBe(action);
  await act(async () => action.click());
  expect(remove).toHaveBeenCalledExactlyOnceWith("two");
  expect(changed).not.toHaveBeenCalled();
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("keeps menu options inside the native modal's interactive subtree", async () => {
  const changed = vi.fn();
  await act(async () =>
    root.render(
      <dialog open>
        <Picker changed={changed} />
      </dialog>,
    ),
  );
  const trigger =
    container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  await act(async () => trigger.click());
  expect(container.querySelector('dialog [role="listbox"]')).not.toBeNull();
  await key(trigger, "End");
  await key(trigger, "Enter");
  expect(changed).toHaveBeenCalledExactlyOnceWith("hermes");
});

it("recalculates menu height when asynchronous options arrive while open", async () => {
  const render = (loaded: boolean) =>
    root.render(
      <ThemedSelect
        aria-label="Projects"
        value=""
        onChange={() => {}}
        className="w-full"
      >
        <option value="">Choose</option>
        {loaded && (
          <>
            <option value="first">First</option>
            <option value="second">Second</option>
          </>
        )}
      </ThemedSelect>,
    );
  await act(async () => render(false));
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[role="combobox"]')!.click(),
  );
  const before =
    document.querySelector<HTMLElement>('[role="listbox"]')!.style.maxHeight;
  await act(async () => render(true));
  const menu = document.querySelector<HTMLElement>('[role="listbox"]')!;
  expect(Number.parseFloat(menu.style.maxHeight)).toBeGreaterThan(
    Number.parseFloat(before),
  );
  expect(menu.textContent).toContain("Second");
});

it("closes when another menu stops propagation, including keyboard activation", async () => {
  const changed = vi.fn();
  const openOther = vi.fn();
  await act(async () =>
    root.render(
      <>
        <Picker changed={changed} />
        <div
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button onClick={openOther}>Other menu</button>
        </div>
      </>,
    ),
  );
  const trigger =
    container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  const other = container.querySelector<HTMLButtonElement>(
    "div > button:not([role])",
  )!;
  await act(async () => trigger.click());
  await act(async () =>
    other.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
  );
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  await act(async () => trigger.click());
  await act(async () => other.click());
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(openOther).toHaveBeenCalledOnce();
  expect(changed).not.toHaveBeenCalled();
});

it("toggles multiple options without closing and retains native form values", async () => {
  const changed = vi.fn();
  function MultiPicker() {
    const [values, setValues] = useState(["first"]);
    return (
      <ThemedSelect
        multiple
        aria-label="Projects"
        value={values}
        onChange={(next) => {
          setValues(next);
          changed(next);
        }}
      >
        <option value="first">First</option>
        <option value="second">Second</option>
        <option value="disabled" disabled>
          Unavailable
        </option>
      </ThemedSelect>
    );
  }
  await act(async () => root.render(<MultiPicker />));
  const trigger =
    container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  trigger.focus();
  await key(trigger, "ArrowDown");
  await key(trigger, "ArrowDown");
  await key(trigger, " ");
  expect(changed).toHaveBeenLastCalledWith(["first", "second"]);
  expect(
    document
      .querySelector('[role="listbox"]')
      ?.getAttribute("aria-multiselectable"),
  ).toBe("true");
  expect(
    [...container.querySelector("select")!.selectedOptions].map(
      (option) => option.value,
    ),
  ).toEqual(["first", "second"]);
  await key(trigger, "Home");
  await key(trigger, "Enter");
  expect(changed).toHaveBeenLastCalledWith(["second"]);
  expect(trigger.textContent).toBe("Second");
  await key(trigger, "Escape");
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(changed).toHaveBeenCalledTimes(2);
});
