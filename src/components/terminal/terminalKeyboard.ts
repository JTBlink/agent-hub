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
