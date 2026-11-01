// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { loadTerminalFonts, terminalAppearance } from "./terminalAppearance";

afterEach(() => {
  document.documentElement.removeAttribute("style");
  Reflect.deleteProperty(document, "fonts");
});

it("uses the shared code font and size when measuring a terminal grid", () => {
  const styles = document.documentElement.style;
  styles.setProperty("--font-family-code", '"AgentHub Mono", monospace');
  styles.setProperty("--font-size-code", "16px");
  styles.setProperty("--line-height-terminal", "1");
  expect(terminalAppearance(styles)).toMatchObject({
    fontFamily: '"AgentHub Mono", monospace',
    fontSize: 16,
    lineHeight: 1,
    letterSpacing: 0,
  });
});

it("loads text styles and symbols at the configured code size before PTY measurement", async () => {
  document.documentElement.style.setProperty("--font-size-code", "16px");
  const load = vi.fn().mockResolvedValue([]);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load },
  });
  await loadTerminalFonts();
  expect(load.mock.calls.map(([font]) => font)).toEqual([
    '16px "AgentHub Mono"',
    'bold 16px "AgentHub Mono"',
    'italic 16px "AgentHub Mono"',
    'bold italic 16px "AgentHub Mono"',
    '16px "AgentHub Symbols"',
  ]);
});
