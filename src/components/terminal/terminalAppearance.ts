import type { ITerminalOptions, ITheme } from "@xterm/xterm";
import { terminalFont } from "../../fonts";
import "./terminal.css";

/** Combine shared font metrics with terminal-specific rendering options. */
export function terminalAppearance(
  styles: CSSStyleDeclaration,
): ITerminalOptions {
  return {
    ...terminalFont(styles),
    minimumContrastRatio: 4.5,
    customGlyphs: true,
    drawBoldTextInBrightColors: true,
    cursorStyle: "bar",
    cursorInactiveStyle: "outline",
  };
}

/** ANSI colors are theme tokens, independent of the shell or running TUI. */
export function terminalTheme(styles: CSSStyleDeclaration): ITheme {
  const color = (token: string) =>
    styles.getPropertyValue(token).trim() || undefined;
  return {
    background: color("--terminal-background"),
    foreground: color("--terminal-foreground"),
    cursor: color("--terminal-cursor"),
    cursorAccent: color("--terminal-cursor-accent"),
    selectionBackground: color("--terminal-selection"),
    selectionInactiveBackground: color("--terminal-selection-inactive"),
    selectionForeground: color("--terminal-selection-foreground"),
    black: color("--terminal-black"),
    red: color("--terminal-red"),
    green: color("--terminal-green"),
    yellow: color("--terminal-yellow"),
    blue: color("--terminal-blue"),
    magenta: color("--terminal-magenta"),
    cyan: color("--terminal-cyan"),
    white: color("--terminal-white"),
    brightBlack: color("--terminal-bright-black"),
    brightRed: color("--terminal-bright-red"),
    brightGreen: color("--terminal-bright-green"),
    brightYellow: color("--terminal-bright-yellow"),
    brightBlue: color("--terminal-bright-blue"),
    brightMagenta: color("--terminal-bright-magenta"),
    brightCyan: color("--terminal-bright-cyan"),
    brightWhite: color("--terminal-bright-white"),
  };
}
