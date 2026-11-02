import { getAppScale } from "../lib/textScale";

/** Font metrics shared with the terminal; independent of its rendering engine. */
export function terminalFont(styles: CSSStyleDeclaration) {
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
    fontWeight: "500" as const,
    fontWeightBold: "700" as const,
  };
}

/** Load both text styles and private-use icons before measuring the PTY grid. */
export async function loadTerminalFonts(): Promise<void> {
  if (!document.fonts) return;
  const appearance = terminalFont(getComputedStyle(document.documentElement));
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
