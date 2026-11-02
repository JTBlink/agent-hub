import type { ITerminalOptions, ITheme } from "@xterm/xterm";
import { getAppScale } from "../../lib/textScale";
import "./terminal.css";

/** Share the code font, with a larger terminal size for sustained TUI reading. */
export function terminalAppearance(
  styles: CSSStyleDeclaration,
): ITerminalOptions {
  const fontSize =
    parseFloat(styles.getPropertyValue("--font-size-terminal")) ||
    parseFloat(styles.getPropertyValue("--font-size-code"));
  return {
    fontFamily:
      styles.getPropertyValue("--font-family-code").trim() || undefined,
    fontSize: fontSize > 0 ? fontSize * getAppScale() : undefined,
    lineHeight:
      parseFloat(styles.getPropertyValue("--line-height-terminal")) ||
      undefined,
    letterSpacing: 0,
    fontWeight: "500",
    fontWeightBold: "700",
    minimumContrastRatio: 4.5,
    customGlyphs: true,
    drawBoldTextInBrightColors: true,
    cursorStyle: "bar",
    cursorInactiveStyle: "outline",
  };
}

/** Load both text styles and private-use icons before measuring the PTY grid. */
export async function loadTerminalFonts(): Promise<void> {
  if (!document.fonts) return;
  const appearance = terminalAppearance(
    getComputedStyle(document.documentElement),
  );
  const size = appearance.fontSize ? `${appearance.fontSize}px` : "1em";
  // FontFaceSet.load defaults to a space, which never selects a unicode-range
  // icon face. Include text, BMP icons and supplementary icons in every style.
  const sample = "\ue0a0\ue60b\uf07b\uf002\uf126\uf06e\uf013\ueb37\udb80\udc01";
  await Promise.all(
    [
      `${appearance.fontWeight} `,
      `${appearance.fontWeightBold} `,
      `italic ${appearance.fontWeight} `,
      `italic ${appearance.fontWeightBold} `,
    ].flatMap((style) => [
      document.fonts.load(`${style}${size} "AgentHub Mono"`, "M"),
      document.fonts.load(`${style}${size} "AgentHub Symbols"`, sample),
    ]),
  );
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
