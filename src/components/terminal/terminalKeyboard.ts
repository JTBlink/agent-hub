import type { Terminal } from "@xterm/xterm";

const SHIFTED_SYMBOLS: Readonly<Record<string, string>> = {
  Digit1: "!",
  Digit2: "@",
  Digit3: "#",
  Digit4: "$",
  Digit5: "%",
  Digit6: "^",
  Digit7: "&",
  Digit8: "*",
  Digit9: "(",
  Digit0: ")",
  Backquote: "~",
  Minus: "_",
  Equal: "+",
  BracketLeft: "{",
  BracketRight: "}",
  Backslash: "|",
  Semicolon: ":",
  Quote: '"',
  Comma: "<",
  Period: ">",
  Slash: "?",
};

function shiftedText(event: KeyboardEvent): string | null {
  if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
    return null;
  // Prefer the layout-resolved character, even when WebKit reports keyCode 229.
  if (/^[\x20-\x7e]$/.test(event.key)) return event.key;
  if (event.key !== "Process" && event.key !== "Unidentified") return null;
  if (event.keyCode !== 229) return null;
  // Some English-mode IMEs omit the character and the subsequent input event.
  if (/^Key[A-Z]$/.test(event.code))
    return event.getModifierState("CapsLock")
      ? event.code.slice(3).toLowerCase()
      : event.code.slice(3);
  return SHIFTED_SYMBOLS[event.code] ?? null;
}

/** Preserve native IME startup and commit text before textarea values are replaced. */
export function bindTerminalTextInput(
  node: HTMLElement,
  terminal: Pick<Terminal, "input" | "textarea">,
) {
  let composing = false;
  let finishing = false;
  let committedText: string | null = null;
  let pending = 0;
  let finishTimer = 0;
  const start = () => {
    window.clearTimeout(finishTimer);
    composing = true;
    finishing = false;
    committedText = null;
    pending = 0;
  };
  const end = (event: CompositionEvent) => {
    composing = false;
    // English-mode IMEs can still use full composition sessions. Commit their
    // final ASCII text now: a later composition may replace the textarea before
    // xterm's timeout reads it. Non-ASCII commits use final native input data.
    if (/^[\x20-\x7e]+$/.test(event.data)) {
      window.clearTimeout(finishTimer);
      finishing = false;
      committedText = event.data;
      pending = 0;
      terminal.input(event.data, true);
      if (terminal.textarea) terminal.textarea.value = "";
      return;
    }
    committedText = null;
    finishing = true;
    // If no final native input arrives, let xterm flush the composition.
    finishTimer = window.setTimeout(() => {
      finishing = false;
    }, 0);
  };
  const input = (event: Event) => {
    if (!(event instanceof InputEvent)) return;
    if (
      committedText !== null &&
      !composing &&
      (event.inputType === "insertText" ||
        event.inputType === "insertCompositionText" ||
        event.inputType === "insertFromComposition") &&
      (!event.data || event.data === committedText)
    ) {
      event.stopImmediatePropagation();
      if (terminal.textarea) terminal.textarea.value = "";
      return;
    }
    // Use the native final input data for non-ASCII commits. Unlike preedit,
    // this is ready to send before a following composition replaces the value.
    if (
      finishing &&
      !composing &&
      !event.isComposing &&
      event.data &&
      ["insertText", "insertCompositionText", "insertFromComposition"].includes(
        event.inputType,
      )
    ) {
      window.clearTimeout(finishTimer);
      finishing = false;
      pending = 0;
      committedText = event.data;
      event.stopImmediatePropagation();
      terminal.input(event.data, true);
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
      if (event.type === "keypress") {
        if (
          pending &&
          !composing &&
          !event.isComposing &&
          event.charCode &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey
        ) {
          // xterm sends this character from keypress. Some IMEs still emit
          // input afterwards, so retire the pending native-text path first.
          pending = 0;
          committedText = String.fromCharCode(event.charCode);
        }
        return true;
      }
      if (event.type !== "keydown" || event.defaultPrevented) return true;
      committedText = null;
      if (composing || finishing || event.isComposing) return true;
      const text = shiftedText(event);
      if (text !== null) {
        pending = 0;
        event.preventDefault();
        terminal.input(text, true);
        return false;
      }
      if (
        (event.keyCode === 229 || /^[\x20-\x7e]$/.test(event.key)) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        pending++;
        // Do not cancel the initial letter: native IMEs may only start
        // composition after this keydown, without keyCode 229 yet. Let native
        // keypress/input deliver text, and bypass xterm's early keydown send.
        return false;
      }
      pending = 0;
      return true;
    },
    dispose() {
      window.clearTimeout(finishTimer);
      node.removeEventListener("compositionstart", start, true);
      node.removeEventListener("compositionend", end, true);
      node.removeEventListener("input", input, true);
    },
  };
}
