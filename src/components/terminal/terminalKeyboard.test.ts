// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { bindTerminalTextInput } from "./terminalKeyboard";

it("allows an initial letter to start native Chinese composition before emitting any English text", async () => {
  const { bindTerminalTextInput } = await import("./terminalKeyboard");
  const node = document.createElement("div");
  const textarea = document.createElement("textarea");
  node.append(textarea);
  const input = vi.fn();
  const keyboard = bindTerminalTextInput(node, { input, textarea });
  const event = new KeyboardEvent("keydown", {
    key: "n",
    code: "KeyN",
    keyCode: 78,
    cancelable: true,
  });
  expect(keyboard.handle(event)).toBe(false);
  expect(event.defaultPrevented).toBe(false);
  expect(input).not.toHaveBeenCalled();
  textarea.dispatchEvent(
    new CompositionEvent("compositionstart", { bubbles: true }),
  );
  textarea.value = "你";
  textarea.dispatchEvent(
    new InputEvent("input", {
      inputType: "insertCompositionText",
      data: "你",
      isComposing: true,
      bubbles: true,
    }),
  );
  expect(input).not.toHaveBeenCalled();
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
  expect(input).toHaveBeenCalledExactlyOnceWith("你", true);
  keyboard.dispose();
});

it("delivers fast printable keys exactly once even without legacy key codes", () => {
  const input = vi.fn();
  const node = document.createElement("div");
  const keyboard = bindTerminalTextInput(node, { input });
  for (const key of "clear CLEAR 0123!") {
    const event = new KeyboardEvent("keydown", {
      key,
      keyCode: 0,
      cancelable: true,
    });
    expect(keyboard.handle(event)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    node.dispatchEvent(
      new InputEvent("input", {
        inputType: "insertText",
        data: key,
      }),
    );
    expect(keyboard.handle(new KeyboardEvent("keyup", { key }))).toBe(true);
  }
  expect(input.mock.calls.map(([data]) => data).join("")).toBe(
    "clear CLEAR 0123!",
  );
  keyboard.dispose();
});

it("leaves composition, shortcuts, dead keys and terminal controls to xterm", () => {
  const input = vi.fn();
  const keyboard = bindTerminalTextInput(document.createElement("div"), {
    input,
  });
  for (const options of [
    { key: "a", isComposing: true },
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
    expect(keyboard.handle(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(input).not.toHaveBeenCalled();
  keyboard.dispose();
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

it.each(["A", "Process", "Unidentified"])(
  "sends Shift+letters once when WebKit reports key %s and IME keyCode",
  async (reportedKey) => {
    const { bindTerminalTextInput } = await import("./terminalKeyboard");
    const node = document.createElement("div");
    const textarea = document.createElement("textarea");
    node.append(textarea);
    const input = vi.fn();
    const keyboard = bindTerminalTextInput(node, { input, textarea });
    for (const key of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const event = new KeyboardEvent("keydown", {
        key: reportedKey === "A" ? key : reportedKey,
        code: `Key${key}`,
        keyCode: 229,
        shiftKey: true,
        cancelable: true,
      });
      expect(keyboard.handle(event)).toBe(false);
      expect(event.defaultPrevented).toBe(true);
      expect(keyboard.handle(event)).toBe(true);
      expect(
        keyboard.handle(new KeyboardEvent("keyup", { key, shiftKey: true })),
      ).toBe(true);
    }
    expect(input.mock.calls.map(([data]) => data).join("")).toBe(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    );
    keyboard.dispose();
  },
);

it("leaves shifted shortcuts and active IME composition on xterm's path", async () => {
  const { bindTerminalTextInput } = await import("./terminalKeyboard");
  const node = document.createElement("div");
  const input = vi.fn();
  const keyboard = bindTerminalTextInput(node, { input });
  for (const options of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { isComposing: true },
  ]) {
    const event = new KeyboardEvent("keydown", {
      key: "Process",
      code: "KeyA",
      keyCode: 229,
      shiftKey: true,
      cancelable: true,
      ...options,
    });
    expect(keyboard.handle(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  }
  node.dispatchEvent(new CompositionEvent("compositionstart"));
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
  expect(input).not.toHaveBeenCalled();
  keyboard.dispose();
});

it("maps shifted number and punctuation keys while honoring layout-resolved characters", async () => {
  const { bindTerminalTextInput } = await import("./terminalKeyboard");
  const node = document.createElement("div");
  const input = vi.fn();
  const keyboard = bindTerminalTextInput(node, { input });
  const codes = [
    ...Array.from({ length: 10 }, (_, i) => `Digit${(i + 1) % 10}`),
    "Backquote",
    "Minus",
    "Equal",
    "BracketLeft",
    "BracketRight",
    "Backslash",
    "Semicolon",
    "Quote",
    "Comma",
    "Period",
    "Slash",
  ];
  for (const code of codes) {
    const event = new KeyboardEvent("keydown", {
      key: "Process",
      code,
      keyCode: 229,
      shiftKey: true,
      cancelable: true,
    });
    expect(keyboard.handle(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  }
  // A non-US layout can resolve Shift+Digit2 to a different character.
  keyboard.handle(
    new KeyboardEvent("keydown", {
      key: '"',
      code: "Digit2",
      keyCode: 229,
      shiftKey: true,
      cancelable: true,
    }),
  );
  expect(input.mock.calls.map(([data]) => data).join("")).toBe(
    '!@#$%^&*()~_+{}|:"<>?"',
  );
  keyboard.dispose();
});

it("preserves shifted terminal controls and dead keys without turning them into text", async () => {
  const { bindTerminalTextInput } = await import("./terminalKeyboard");
  const input = vi.fn();
  const keyboard = bindTerminalTextInput(document.createElement("div"), {
    input,
  });
  for (const key of [
    "Tab",
    "Enter",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Backspace",
    "Delete",
    "F1",
    "Escape",
    "Dead",
  ]) {
    const event = new KeyboardEvent("keydown", {
      key,
      shiftKey: true,
      code: key === "Dead" ? "Backquote" : key,
      cancelable: true,
    });
    expect(keyboard.handle(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(input).not.toHaveBeenCalled();
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

it("keeps Chinese preedit on xterm's path and sends only the final native commit", async () => {
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
  expect(input).not.toHaveBeenCalled();
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
  expect(input).toHaveBeenCalledExactlyOnceWith("你", true);
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
