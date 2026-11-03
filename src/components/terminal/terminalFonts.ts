import type { Terminal } from "@xterm/xterm";

/** xterm measures at open(), before async fonts may be ready. refresh()/fit()
 * redraw using that cached width. Change a public font option synchronously to
 * remeasure after loading, without touching private services or the PTY.
 */
export function remeasureTerminalFont(terminal: Terminal): void {
  const family = terminal.options.fontFamily;
  terminal.options.fontFamily = `${family}, monospace`;
  terminal.options.fontFamily = family;
}
