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
