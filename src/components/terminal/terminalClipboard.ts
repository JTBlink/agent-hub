import type { Terminal } from "@xterm/xterm";

/** Consume one native paste before xterm's text-only clipboard listener. */
export function bindTerminalPaste(node: HTMLElement, terminal: Terminal) {
  const paste = (event: ClipboardEvent) => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const image =
      Array.from(clipboard.types).some((type) => type.startsWith("image/")) ||
      Array.from(clipboard.items).some((item) =>
        item.type.startsWith("image/"),
      );
    if (!image && !clipboard.types.includes("text/plain")) return;
    event.preventDefault();
    event.stopPropagation();
    if (image) {
      // Let the foreground TUI read the original system clipboard as an image.
      terminal.input("\x16", true);
    } else {
      // xterm applies newline normalization and the application's bracketed mode.
      terminal.paste(clipboard.getData("text/plain"));
    }
  };
  node.addEventListener("paste", paste, true);
  return () => node.removeEventListener("paste", paste, true);
}
