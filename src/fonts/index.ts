import { loadTerminalIconFonts, terminalFontFamily } from "./terminal-icons";
import { getAppScale } from "../lib/textScale";

/** Font metrics shared with the terminal; independent of its rendering engine. */
export function terminalFont(styles: CSSStyleDeclaration) {
  const fontSize =
    parseFloat(styles.getPropertyValue("--font-size-terminal")) ||
    parseFloat(styles.getPropertyValue("--font-size-code"));
  return {
    fontFamily: terminalFontFamily,
    fontSize: fontSize > 0 ? fontSize * getAppScale() : undefined,
    lineHeight:
      parseFloat(styles.getPropertyValue("--line-height-terminal")) ||
      undefined,
    letterSpacing: 0,
    fontWeight: "500" as const,
    fontWeightBold: "700" as const,
  };
}

/** Load complete terminal faces before measuring or drawing a PTY grid. */
export const loadTerminalFonts = loadTerminalIconFonts;
