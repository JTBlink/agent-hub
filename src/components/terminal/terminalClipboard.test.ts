// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { bindTerminalPaste } from "./terminalClipboard";

let terminal: Terminal;
let node: HTMLDivElement;
let unbind: () => void;
beforeEach(async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }));
  node = document.createElement("div");
  document.body.append(node);
  const { Terminal } = await import("@xterm/xterm");
  terminal = new Terminal();
  terminal.open(node);
  unbind = bindTerminalPaste(node, terminal);
});
afterEach(() => {
  unbind?.();
  terminal?.dispose();
  node?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function paste(types: string[], text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { types, items: [], getData: () => text },
  });
  node.querySelector("textarea")!.dispatchEvent(event);
  return event;
}
it("delivers multiline Unicode text once with normalized newlines and the TUI's paste markers", async () => {
  await new Promise<void>((resolve) => terminal.write("\x1b[?2004h", resolve));
  const data = vi.fn();
  terminal.onData(data);
  expect(paste(["text/plain"], "first\r\n第二行\n🙂").defaultPrevented).toBe(
    true,
  );
  expect(data).toHaveBeenCalledExactlyOnceWith(
    "\x1b[200~first\r第二行\r🙂\x1b[201~",
  );
});
it("sends the image shortcut outside bracketed paste without inserting a text alternative", async () => {
  await new Promise<void>((resolve) => terminal.write("\x1b[?2004h", resolve));
  const data = vi.fn();
  terminal.onData(data);
  paste(["image/png", "text/plain"], "image description");
  expect(data).toHaveBeenCalledExactlyOnceWith("\x16");
});

it("pastes into a shell without adding Enter or bracket markers", () => {
  const data = vi.fn();
  terminal.onData(data);
  paste(["text/plain"], "echo hello");
  expect(data).toHaveBeenCalledExactlyOnceWith("echo hello");
});
