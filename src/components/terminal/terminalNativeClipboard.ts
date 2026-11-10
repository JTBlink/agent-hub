import type { Terminal } from "@xterm/xterm";
import { readTerminalClipboard } from "../../lib/terminalApi";

/** Share native file/text/image handling between keyboard and context-menu paste. */
export async function pasteTerminalClipboard(
  terminal: Pick<Terminal, "paste" | "input">,
  isCurrent: () => boolean,
) {
  const content = await readTerminalClipboard();
  if (!isCurrent()) return;
  if (content.kind === "text") terminal.paste(content.text);
  else if (content.kind === "image") terminal.input("\x16", true);
}
