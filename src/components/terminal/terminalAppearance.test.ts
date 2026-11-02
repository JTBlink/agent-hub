// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { loadTerminalFonts, terminalAppearance } from "./terminalAppearance";

afterEach(() => {
  document.documentElement.removeAttribute("style");
  Reflect.deleteProperty(document, "fonts");
});

it("uses the shared code font with the terminal reading size when measuring a grid", () => {
  const styles = document.documentElement.style;
  styles.setProperty("--font-family-code", '"AgentHub Mono", monospace');
  styles.setProperty("--font-size-code", "16px");
  styles.setProperty("--font-size-terminal", "15px");
  styles.setProperty("--line-height-terminal", "1");
  expect(terminalAppearance(styles)).toMatchObject({
    fontFamily: '"AgentHub Mono", monospace',
    fontSize: 15,
    lineHeight: 1,
    letterSpacing: 0,
  });
});

it("loads text styles and symbols at the configured code size before PTY measurement", async () => {
  document.documentElement.style.setProperty("--font-size-code", "16px");
  document.documentElement.style.setProperty("--font-size-terminal", "15px");
  const load = vi.fn().mockResolvedValue([]);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load },
  });
  await loadTerminalFonts();
  expect(load.mock.calls).toHaveLength(8);
  for (const style of ["500 ", "700 ", "italic 500 ", "italic 700 "]) {
    expect(load).toHaveBeenCalledWith(`${style}15px "AgentHub Mono"`, "M");
    expect(load).toHaveBeenCalledWith(
      `${style}15px "AgentHub Symbols"`,
      expect.stringContaining("\uf002\uf126\uf06e\uf013"),
    );
  }
});

it("scales terminal cells through font size so mouse reporting uses visible pixels", () => {
  const styles = document.documentElement.style;
  styles.setProperty("--font-size-code", "16px");
  styles.setProperty("--app-scale", "1.2");
  expect(terminalAppearance(styles).fontSize).toBe(19.2);
  styles.setProperty("--app-scale", "0.9");
  expect(terminalAppearance(styles).fontSize).toBe(14.4);
});
