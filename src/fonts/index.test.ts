// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { loadTerminalFonts, terminalFont } from "./index";
import { terminalFontFamily } from "./terminal-icons";

afterEach(() => {
  document.documentElement.removeAttribute("style");
  Reflect.deleteProperty(document, "fonts");
});

it("uses the complete terminal family with the configured terminal reading size", () => {
  const styles = document.documentElement.style;
  styles.setProperty("--font-family-code", '"AgentHub Mono", monospace');
  styles.setProperty("--font-size-code", "16px");
  styles.setProperty("--font-size-terminal", "15px");
  styles.setProperty("--line-height-terminal", "1");
  expect(terminalFont(styles)).toMatchObject({
    fontFamily: terminalFontFamily,
    fontSize: 15,
    lineHeight: 1,
    letterSpacing: 0,
  });
});

it("loads all complete terminal faces before PTY measurement", async () => {
  document.documentElement.style.setProperty("--font-size-code", "16px");
  document.documentElement.style.setProperty("--font-size-terminal", "15px");
  const load = vi.fn().mockResolvedValue([{}]);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load },
  });
  await loadTerminalFonts();
  expect(load.mock.calls).toHaveLength(4);
  const parsed = load.mock.calls.map(([font]) => {
    const element = document.createElement("span");
    element.style.font = font;
    expect(element.style.fontSize).toBe("16px");
    return [element.style.fontStyle || "normal", element.style.fontWeight];
  });
  expect(parsed).toEqual([
    ["normal", "500"],
    ["normal", "700"],
    ["italic", "500"],
    ["italic", "700"],
  ]);
});

it("scales terminal cells through font size so mouse reporting uses visible pixels", () => {
  const styles = document.documentElement.style;
  styles.setProperty("--font-size-code", "16px");
  styles.setProperty("--app-scale", "1.2");
  expect(terminalFont(styles).fontSize).toBe(19.2);
  styles.setProperty("--app-scale", "0.9");
  expect(terminalFont(styles).fontSize).toBe(14.4);
});

it("shares one document load between panes and retries failures", async () => {
  const load = vi.fn().mockRejectedValue(new Error("unavailable"));
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load },
  });
  const first = loadTerminalFonts();
  expect(loadTerminalFonts()).toBe(first);
  await expect(first).rejects.toThrow("unavailable");
  load.mockResolvedValue([{}]);
  await loadTerminalFonts();
  expect(load).toHaveBeenCalledTimes(8);
  await loadTerminalFonts();
  expect(load).toHaveBeenCalledTimes(8);
});

it("rejects missing declarations instead of treating an empty font set as ready", async () => {
  const load = vi.fn().mockResolvedValue([]);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load },
  });
  await expect(loadTerminalFonts()).rejects.toThrow(
    "Bundled terminal face unavailable",
  );
  load.mockResolvedValue([{}]);
  await expect(loadTerminalFonts()).resolves.toBeUndefined();
});
