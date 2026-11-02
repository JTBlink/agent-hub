import type { Terminal } from "@xterm/xterm";

/** Send plain text once from keydown without depending on legacy keyCode/keypress. */
export function handleTerminalTextKey(
  event: KeyboardEvent,
  terminal: Pick<Terminal, "input">,
): boolean {
  if (
    event.type !== "keydown" ||
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    !/^[\x20-\x7e]$/.test(event.key)
  )
    return true;
  event.preventDefault();
  terminal.input(event.key, true);
  return false;
}

/** An IME can commit English through input events while reporting keyCode 229.
 * Keep those commits out of xterm's delayed textarea-diff path. */
export function bindTerminalTextInput(
  node: HTMLElement,
  terminal: Pick<Terminal, "input" | "textarea">,
) {
  let composing = false;
  let finishing = false;
  let asciiCommitted = false;
  let pending = 0;
  let finishTimer = 0;
  const start = () => {
    window.clearTimeout(finishTimer);
    composing = true;
    finishing = false;
    asciiCommitted = false;
    pending = 0;
  };
  const end = (event: CompositionEvent) => {
    composing = false;
    // English-mode IMEs can still use full composition sessions. Commit their
    // final ASCII text now: a later composition may replace the textarea before
    // xterm's timeout reads it. Keep non-ASCII composition on xterm's path.
    if (/^[\x20-\x7e]+$/.test(event.data)) {
      window.clearTimeout(finishTimer);
      finishing = false;
      asciiCommitted = true;
      pending = 0;
      terminal.input(event.data, true);
      if (terminal.textarea) terminal.textarea.value = "";
      return;
    }
    asciiCommitted = false;
    finishing = true;
    // Leave the IME's final input event and xterm's composition flush alone.
    finishTimer = window.setTimeout(() => {
      finishing = false;
    }, 0);
  };
  const input = (event: Event) => {
    if (!(event instanceof InputEvent)) return;
    if (
      asciiCommitted &&
      !composing &&
      (event.inputType === "insertText" ||
        event.inputType === "insertCompositionText") &&
      /^[\x20-\x7e]*$/.test(event.data ?? "")
    ) {
      event.stopImmediatePropagation();
      if (terminal.textarea) terminal.textarea.value = "";
      return;
    }
    if (!pending || composing || finishing || event.isComposing) return;
    const data =
      event.inputType === "insertText"
        ? event.data
        : event.inputType === "deleteContentBackward"
          ? "\x7f"
          : event.inputType === "deleteContentForward"
            ? "\x1b[3~"
            : null;
    if (!data) return;
    pending--;
    event.stopImmediatePropagation();
    terminal.input(data, true);
    if (terminal.textarea) terminal.textarea.value = "";
  };
  node.addEventListener("compositionstart", start, true);
  node.addEventListener("compositionend", end, true);
  node.addEventListener("input", input, true);
  return {
    handle(event: KeyboardEvent) {
      if (event.type !== "keydown") return true;
      asciiCommitted = false;
      if (composing || finishing || event.isComposing) return true;
      if (
        event.keyCode === 229 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        pending++;
        // Let WebKit produce its native input event, without scheduling an
        // asynchronous textarea diff for each overlapping keystroke.
        return false;
      }
      pending = 0;
      return handleTerminalTextKey(event, terminal);
    },
    dispose() {
      window.clearTimeout(finishTimer);
      node.removeEventListener("compositionstart", start, true);
      node.removeEventListener("compositionend", end, true);
      node.removeEventListener("input", input, true);
    },
  };
}
