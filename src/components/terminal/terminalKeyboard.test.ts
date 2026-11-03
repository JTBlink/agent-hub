// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { handleTerminalTextKey } from "./terminalKeyboard";

it("delivers fast printable keys exactly once even without legacy key codes", () => {
  const input = vi.fn();
  for (const key of "clear CLEAR 0123!") {
    const event = new KeyboardEvent("keydown", {
      key,
      keyCode: 0,
      cancelable: true,
    });
    expect(handleTerminalTextKey(event, { input })).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(handleTerminalTextKey(event, { input })).toBe(true);
    expect(
      handleTerminalTextKey(new KeyboardEvent("keyup", { key }), { input }),
    ).toBe(true);
  }
  expect(input.mock.calls.map(([data]) => data).join("")).toBe(
    "clear CLEAR 0123!",
  );
});

it("leaves composition, shortcuts, dead keys and terminal controls to xterm", () => {
  const input = vi.fn();
  for (const options of [
    { key: "a", isComposing: true },
    { key: "a", keyCode: 229 },
    { key: "c", ctrlKey: true },
    { key: "v", metaKey: true },
    { key: "e", altKey: true },
    { key: "Dead" },
    { key: "Enter" },
    { key: "ArrowLeft" },
    { key: "Backspace" },
  ]) {
    const event = new KeyboardEvent("keydown", {
      ...options,
      cancelable: true,
    });
    expect(handleTerminalTextKey(event, { input })).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(input).not.toHaveBeenCalled();
});

it("sends a question mark from Shift+Slash even when WebKit reports an IME key", async () => {
  const { bindTerminalTextInput } = await import("./terminalKeyboard");
  const node = document.createElement("div");
  const textarea = document.createElement("textarea");
  node.append(textarea);
  const input = vi.fn();
  const keyboard = bindTerminalTextInput(node, { input, textarea });
  const event = new KeyboardEvent("keydown", {
    key: "Process",
    code: "Slash",
    keyCode: 229,
    shiftKey: true,
    cancelable: true,
  });

  expect(keyboard.handle(event)).toBe(false);
  expect(event.defaultPrevented).toBe(true);
  expect(input).toHaveBeenCalledExactlyOnceWith("?", true);
  keyboard.dispose();
});

it("sends every English IME commit once without waiting for textarea timers", async () => {
  const { bindTerminalTextInput } = await import("./terminalKeyboard");
  const node = document.createElement("div");
  const textarea = document.createElement("textarea");
  node.append(textarea);
  const input = vi.fn();
  const keyboard = bindTerminalTextInput(node, { input, textarea });
  const expected = "clear git branch 0123456789";
  for (const key of expected) {
    const event = new KeyboardEvent("keydown", {
      key,
      keyCode: 229,
      cancelable: true,
    });
    expect(keyboard.handle(event)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    textarea.value += key;
    textarea.dispatchEvent(
      new InputEvent("input", {
        inputType: "insertText",
        data: key,
        bubbles: true,
        composed: true,
      }),
    );
  }
  expect(input.mock.calls.map(([data]) => data).join("")).toBe(expected);
  expect(textarea.value).toBe("");
  keyboard.dispose();
});

it("keeps preedit and the final Chinese composition commit on xterm's original path", async () => {
  const { bindTerminalTextInput } = await import("./terminalKeyboard");
  const node = document.createElement("div");
  const textarea = document.createElement("textarea");
  node.append(textarea);
  const input = vi.fn();
  const keyboard = bindTerminalTextInput(node, { input, textarea });
  keyboard.handle(new KeyboardEvent("keydown", { key: "n", keyCode: 229 }));
  textarea.dispatchEvent(
    new CompositionEvent("compositionstart", { bubbles: true }),
  );
  expect(
    keyboard.handle(
      new KeyboardEvent("keydown", {
        key: "i",
        keyCode: 229,
        isComposing: true,
      }),
    ),
  ).toBe(true);
  textarea.dispatchEvent(
    new InputEvent("input", {
      inputType: "insertCompositionText",
      data: "你",
      isComposing: true,
      bubbles: true,
    }),
  );
  textarea.dispatchEvent(
    new CompositionEvent("compositionend", { data: "你", bubbles: true }),
  );
  textarea.dispatchEvent(
    new InputEvent("input", {
      inputType: "insertText",
      data: "你",
      bubbles: true,
    }),
  );
  expect(input).not.toHaveBeenCalled();
  keyboard.dispose();
});

it("commits consecutive English composition sessions before their textarea values are replaced", async () => {
  const { bindTerminalTextInput } = await import("./terminalKeyboard");
  const node = document.createElement("div");
  const textarea = document.createElement("textarea");
  node.append(textarea);
  const input = vi.fn();
  const keyboard = bindTerminalTextInput(node, { input, textarea });
  for (const text of ["cl", "ear", " 0123456789"]) {
    keyboard.handle(
      new KeyboardEvent("keydown", { key: text[0], keyCode: 229 }),
    );
    textarea.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    textarea.value = text;
    textarea.dispatchEvent(
      new CompositionEvent("compositionend", { data: text, bubbles: true }),
    );
    // WebKit may still deliver a final input event after compositionend.
    textarea.value = text;
    textarea.dispatchEvent(
      new InputEvent("input", {
        inputType: "insertCompositionText",
        data: text,
        bubbles: true,
        composed: true,
      }),
    );
    textarea.dispatchEvent(
      new InputEvent("input", {
        inputType: "insertText",
        data: text,
        bubbles: true,
        composed: true,
      }),
    );
  }
  expect(input.mock.calls.map(([data]) => data).join("")).toBe(
    "clear 0123456789",
  );
  expect(input).toHaveBeenCalledTimes(3);
  keyboard.dispose();
});
