// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readTerminalClipboard } from "../../lib/terminalApi";
import { bindTerminalPaste } from "./terminalClipboard";
import { pasteTerminalClipboard } from "./terminalNativeClipboard";

vi.mock("../../lib/terminalApi", () => ({ readTerminalClipboard: vi.fn() }));
const terminal = { paste: vi.fn(), input: vi.fn() };
let node: HTMLDivElement;
let input: HTMLTextAreaElement;
let unbind: () => void;
const error = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  node = document.createElement("div");
  input = document.createElement("textarea");
  node.append(input);
  document.body.append(node);
  input.focus();
  unbind = bindTerminalPaste(
    node,
    terminal,
    (isCurrent) => pasteTerminalClipboard(terminal, isCurrent),
    error,
  );
});
afterEach(() => {
  unbind();
  node.remove();
});
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

it.each([{ metaKey: true }, { ctrlKey: true, shiftKey: true }])(
  "pastes copied files once with %o even when WebKit supplies no paste event",
  async (modifier) => {
    const text = "'/tmp/示例 file.txt' '/tmp/other.txt'";
    vi.mocked(readTerminalClipboard).mockResolvedValue({ kind: "text", text });
    const key = new KeyboardEvent("keydown", {
      key: "v",
      ...modifier,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(key);
    await flush();
    expect(key.defaultPrevented).toBe(true);
    expect(readTerminalClipboard).toHaveBeenCalledOnce();
    expect(terminal.paste).toHaveBeenCalledExactlyOnceWith(text);
    expect(terminal.input).not.toHaveBeenCalled();
  },
);

it("consumes file-only paste events and preserves the image shortcut and literal Ctrl+V", async () => {
  vi.mocked(readTerminalClipboard).mockResolvedValue({ kind: "image" });
  const paste = new Event("paste", { bubbles: true, cancelable: true });
  input.dispatchEvent(paste);
  await flush();
  expect(paste.defaultPrevented).toBe(true);
  expect(terminal.input).toHaveBeenCalledExactlyOnceWith("\x16", true);
  expect(terminal.paste).not.toHaveBeenCalled();
  const key = new KeyboardEvent("keydown", {
    key: "v",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  input.dispatchEvent(key);
  expect(key.defaultPrevented).toBe(false);
  expect(readTerminalClipboard).toHaveBeenCalledOnce();
});

it("discards a clipboard response when focus moves or its terminal is disposed", async () => {
  let resolve!: (
    value: Awaited<ReturnType<typeof readTerminalClipboard>>,
  ) => void;
  for (const cancel of [() => input.blur(), () => unbind()]) {
    input.focus();
    vi.mocked(readTerminalClipboard).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    input.dispatchEvent(
      new Event("paste", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
    cancel();
    resolve({ kind: "text", text: "stale path" });
    await flush();
  }
  expect(terminal.paste).not.toHaveBeenCalled();
});

it("reports native clipboard failures and allows the next paste to succeed", async () => {
  vi.mocked(readTerminalClipboard).mockRejectedValueOnce(
    new Error("Clipboard unavailable"),
  );
  input.dispatchEvent(new Event("paste", { bubbles: true, cancelable: true }));
  await flush();
  expect(error).toHaveBeenCalledWith(
    expect.objectContaining({ message: "Clipboard unavailable" }),
  );
  vi.mocked(readTerminalClipboard).mockResolvedValueOnce({
    kind: "text",
    text: "retry",
  });
  input.dispatchEvent(new Event("paste", { bubbles: true, cancelable: true }));
  await flush();
  expect(terminal.paste).toHaveBeenCalledExactlyOnceWith("retry");
});
