import type { Terminal } from "@xterm/xterm";

/** Consume one native paste before xterm's text-only clipboard listener. */
export function bindTerminalPaste(
  node: HTMLElement,
  terminal: Pick<Terminal, "paste" | "input">,
  nativePaste?: (isCurrent: () => boolean) => Promise<void>,
  onError?: (error: unknown) => void,
) {
  let disposed = false;
  let queue = Promise.resolve();
  const request = () => {
    if (!nativePaste) return;
    const current = () => !disposed && node.contains(document.activeElement);
    queue = queue
      .then(() => {
        if (!disposed) return nativePaste(current);
      })
      .catch((error) => {
        if (!disposed) onError?.(error);
      });
  };
  const keydown = (event: KeyboardEvent) => {
    if (
      !nativePaste ||
      event.isComposing ||
      event.altKey ||
      event.key.toLowerCase() !== "v" ||
      !(event.metaKey || (event.ctrlKey && event.shiftKey))
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) request();
  };
  const paste = (event: ClipboardEvent) => {
    if (nativePaste) {
      event.preventDefault();
      event.stopImmediatePropagation();
      request();
      return;
    }
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
  node.addEventListener("keydown", keydown, true);
  return () => {
    disposed = true;
    node.removeEventListener("paste", paste, true);
    node.removeEventListener("keydown", keydown, true);
  };
}

/** Copy completed selections once, without copying every intermediate drag range. */
export function bindTerminalSelectionCopy(
  node: HTMLElement,
  terminal: Terminal,
  copy: () => void,
) {
  let dragging = false;
  let disposed = false;
  let previous = "";
  const flush = () => {
    if (disposed || dragging) return;
    const selection = terminal.getSelection();
    if (selection && selection !== previous) copy();
    previous = selection;
  };
  const down = (event: MouseEvent) => {
    if (event.button === 0) dragging = true;
  };
  const up = (event: MouseEvent) => {
    if (event.button !== 0 || !dragging) return;
    dragging = false;
    queueMicrotask(flush);
  };
  const selection = terminal.onSelectionChange(() => queueMicrotask(flush));
  node.addEventListener("mousedown", down, true);
  document.addEventListener("mouseup", up);
  return () => {
    disposed = true;
    selection.dispose();
    node.removeEventListener("mousedown", down, true);
    document.removeEventListener("mouseup", up);
  };
}
