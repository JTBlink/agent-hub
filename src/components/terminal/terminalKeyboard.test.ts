// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { bindTerminalTextInput } from "./terminalKeyboard";

function setup() {
  const node = document.createElement("div");
  const textarea = document.createElement("textarea");
  node.append(textarea);
  const input = vi.fn();
  return {
    node,
    textarea,
    input,
    keyboard: bindTerminalTextInput(node, { input, textarea }),
  };
}

it("delivers native text once with missing legacy codes or IME keyCode 229", () => {
  const { textarea, input, keyboard } = setup();
  for (const keyCode of [0, 229]) {
    for (const key of "clear 123!") {
      const event = new KeyboardEvent("keydown", {
        key,
        keyCode,
        cancelable: true,
      });
      expect(keyboard.handle(event)).toBe(false);
      expect(event.defaultPrevented).toBe(false);
      textarea.value = key;
      textarea.dispatchEvent(
        new InputEvent("input", {
          inputType: "insertText",
          data: key,
          bubbles: true,
          composed: true,
        }),
      );
    }
  }
  expect(input.mock.calls.map(([data]) => data).join("")).toBe(
    "clear 123!clear 123!",
  );
  expect(textarea.value).toBe("");
  // A native keypress is delivered by xterm; its trailing IME input must not
  // send the same punctuation again, including when it arrives after keyup.
  for (const keyCode of [189, 229]) {
    const previous = input.mock.calls.length;
    keyboard.handle(new KeyboardEvent("keydown", { key: "-", keyCode }));
    expect(
      keyboard.handle(
        new KeyboardEvent("keypress", {
          key: "-",
          charCode: 45,
        }),
      ),
    ).toBe(true);
    keyboard.handle(new KeyboardEvent("keyup", { key: "-" }));
    textarea.dispatchEvent(
      new InputEvent("input", {
        inputType: "insertText",
        data: "-",
        bubbles: true,
        composed: true,
      }),
    );
    expect(input).toHaveBeenCalledTimes(previous);
  }
  keyboard.dispose();
});

it("resolves shifted letters and symbols once, preferring the active layout", () => {
  const { input, keyboard } = setup();
  for (const [key, code] of [
    ["A", "KeyA"],
    ["Process", "KeyB"],
    ["Unidentified", "KeyZ"],
    ["Process", "Digit1"],
    ["Process", "Digit0"],
    ["Process", "Minus"],
    ["Process", "Slash"],
    ['"', "Digit2"],
  ]) {
    const event = new KeyboardEvent("keydown", {
      key,
      code,
      keyCode: 229,
      shiftKey: true,
      cancelable: true,
    });
    expect(keyboard.handle(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(keyboard.handle(event)).toBe(true);
    expect(
      keyboard.handle(
        new KeyboardEvent("keyup", { key, code, shiftKey: true }),
      ),
    ).toBe(true);
  }
  expect(input.mock.calls.map(([data]) => data).join("")).toBe('ABZ!)_?"');
  keyboard.dispose();
});

it("leaves shortcuts, composition and terminal controls to xterm with or without Shift", () => {
  const { input, keyboard } = setup();
  for (const shiftKey of [false, true]) {
    for (const options of [
      { key: "Process", code: "KeyA", keyCode: 229, ctrlKey: true },
      { key: "Process", code: "KeyA", keyCode: 229, metaKey: true },
      { key: "Process", code: "KeyA", keyCode: 229, altKey: true },
      { key: "A", code: "KeyA", isComposing: true },
      ...["Tab", "Enter", "ArrowLeft", "Backspace", "Dead"].map((key) => ({
        key,
      })),
    ]) {
      const event = new KeyboardEvent("keydown", {
        ...options,
        shiftKey,
        cancelable: true,
      });
      expect(keyboard.handle(event)).toBe(true);
      expect(event.defaultPrevented).toBe(false);
    }
  }
  expect(input).not.toHaveBeenCalled();
  keyboard.dispose();
});

it("allows native IME startup and sends consecutive Chinese and English commits without preedit or duplicates", () => {
  const { textarea, input, keyboard } = setup();
  for (const text of ["中文", "输入", "clear"]) {
    const first = new KeyboardEvent("keydown", {
      key: "n",
      code: "KeyN",
      keyCode: 78,
      cancelable: true,
    });
    const previous = input.mock.calls.length;
    expect(keyboard.handle(first)).toBe(false);
    expect(first.defaultPrevented).toBe(false);
    expect(input).toHaveBeenCalledTimes(previous);
    textarea.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    expect(
      keyboard.handle(
        new KeyboardEvent("keydown", {
          key: "A",
          code: "KeyA",
          keyCode: 229,
          shiftKey: true,
        }),
      ),
    ).toBe(true);
    textarea.dispatchEvent(
      new InputEvent("input", {
        inputType: "insertCompositionText",
        data: "ni",
        isComposing: true,
        bubbles: true,
      }),
    );
    expect(input).toHaveBeenCalledTimes(previous);
    textarea.value = text;
    textarea.dispatchEvent(
      new CompositionEvent("compositionend", { data: text, bubbles: true }),
    );
    for (const inputType of ["insertCompositionText", "insertText"]) {
      textarea.value = text;
      textarea.dispatchEvent(
        new InputEvent("input", { inputType, data: text, bubbles: true }),
      );
    }
    expect(input).toHaveBeenCalledTimes(previous + 1);
    expect(textarea.value).toBe("");
  }
  expect(input.mock.calls.map(([data]) => data).join("")).toBe("中文输入clear");
  keyboard.dispose();
});
