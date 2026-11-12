import type { ITerminalOptions, ITheme } from "@xterm/xterm";
import { terminalFont } from "../../fonts";
import "./terminal.css";

/** Preserve program-supplied ANSI colors instead of adjusting cell contrast. */
export function terminalAppearance(
  styles: CSSStyleDeclaration,
): ITerminalOptions {
  return {
    ...terminalFont(styles),
    minimumContrastRatio: 1,
    customGlyphs: true,
    drawBoldTextInBrightColors: true,
    cursorStyle: "bar",
    cursorInactiveStyle: "outline",
  };
}

/**
 * Resolve a CSS custom property to a serialised color that xterm.js can parse
 * reliably.  Reading `getPropertyValue('--terminal-red')` returns the raw token
 * string (e.g. `rgb(243 139 168)` — space-separated), which xterm's built-in
 * regex rejects.  Setting the value on a real element's `color` property and
 * reading it back forces the browser to serialise it as comma-separated
 * `rgb(r, g, b)` that xterm parses on its fast path.
 */
function resolveColors(
  styles: CSSStyleDeclaration,
  tokens: readonly string[],
): Record<string, string | undefined> {
  const el = document.createElement("span");
  document.documentElement.appendChild(el);
  const result: Record<string, string | undefined> = {};
  try {
    for (const token of tokens) {
      const raw = styles.getPropertyValue(token).trim();
      if (!raw) {
        result[token] = undefined;
        continue;
      }
      el.style.color = "";
      el.style.color = raw;
      if (!el.style.color) {
        result[token] = undefined;
        continue;
      }
      const resolved = getComputedStyle(el).color;
      result[token] = resolved || undefined;
    }
  } finally {
    el.remove();
  }
  return result;
}

const THEME_TOKENS = [
  "--terminal-background",
  "--terminal-foreground",
  "--terminal-cursor",
  "--terminal-cursor-accent",
  "--terminal-selection",
  "--terminal-selection-inactive",
  "--terminal-selection-foreground",
  "--terminal-black",
  "--terminal-red",
  "--terminal-green",
  "--terminal-yellow",
  "--terminal-blue",
  "--terminal-magenta",
  "--terminal-cyan",
  "--terminal-white",
  "--terminal-bright-black",
  "--terminal-bright-red",
  "--terminal-bright-green",
  "--terminal-bright-yellow",
  "--terminal-bright-blue",
  "--terminal-bright-magenta",
  "--terminal-bright-cyan",
  "--terminal-bright-white",
] as const;

/** ANSI colors are theme tokens, independent of the shell or running TUI. */
export function terminalTheme(styles: CSSStyleDeclaration): ITheme {
  const c = resolveColors(styles, THEME_TOKENS);
  return {
    background: c["--terminal-background"],
    foreground: c["--terminal-foreground"],
    cursor: c["--terminal-cursor"],
    cursorAccent: c["--terminal-cursor-accent"],
    selectionBackground: c["--terminal-selection"],
    selectionInactiveBackground: c["--terminal-selection-inactive"],
    selectionForeground: c["--terminal-selection-foreground"],
    black: c["--terminal-black"],
    red: c["--terminal-red"],
    green: c["--terminal-green"],
    yellow: c["--terminal-yellow"],
    blue: c["--terminal-blue"],
    magenta: c["--terminal-magenta"],
    cyan: c["--terminal-cyan"],
    white: c["--terminal-white"],
    brightBlack: c["--terminal-bright-black"],
    brightRed: c["--terminal-bright-red"],
    brightGreen: c["--terminal-bright-green"],
    brightYellow: c["--terminal-bright-yellow"],
    brightBlue: c["--terminal-bright-blue"],
    brightMagenta: c["--terminal-bright-magenta"],
    brightCyan: c["--terminal-bright-cyan"],
    brightWhite: c["--terminal-bright-white"],
  };
}
