import "./fonts.css";

/** Self-contained terminal text/icons; no dependency on a particular emulator. */
export const terminalFontFamily =
  '"AgentHub Terminal", "PingFang SC", "Microsoft YaHei", monospace';

const styles = ["500", "700", "italic 500", "italic 700"];

/** Readiness belongs to the document; concurrent panes share one load attempt.
 * Failed attempts are evicted so a later pane can retry. Size is irrelevant to
 * loading a face, and only the four bounded ANSI styles are retained.
 */
const pending = new WeakMap<FontFaceSet, Promise<void>>();
export function loadTerminalIconFonts(): Promise<void> {
  if (!document.fonts) return Promise.resolve();
  const fonts = document.fonts;
  const existing = pending.get(fonts);
  if (existing) return existing;
  const loading = Promise.all(
    styles.map(async (style) => {
      const faces = await fonts.load(
        `${style} 16px "AgentHub Terminal"`,
        "M\uf07b\udb80\udc01",
      );
      if (!faces?.length)
        throw new Error(`Bundled terminal face unavailable: ${style}`);
    }),
  ).then(
    () => {},
    (reason: unknown) => {
      pending.delete(fonts);
      throw reason;
    },
  );
  pending.set(fonts, loading);
  return loading;
}
