// @vitest-environment jsdom
import { expect, it } from "vitest";
import { terminalAppearance, terminalTheme } from "./terminalAppearance";

it("combines shared font metrics with terminal rendering options", () => {
  const styles = document.createElement("div").style;
  styles.setProperty("--font-size-terminal", "15px");
  expect(terminalAppearance(styles)).toMatchObject({
    fontSize: 15,
    fontWeight: "500",
    fontWeightBold: "700",
    minimumContrastRatio: 1,
    customGlyphs: true,
    cursorStyle: "bar",
  });
});

it("resolves modern CSS colors and alpha selection colors for xterm", () => {
  const styles = document.createElement("div").style;
  styles.setProperty("--terminal-red", "rgb(243 139 168)");
  styles.setProperty("--terminal-green", "#a6e3a1");
  styles.setProperty("--terminal-selection", "rgb(137 180 250 / 0.3)");
  expect(terminalTheme(styles)).toMatchObject({
    red: "rgb(243, 139, 168)",
    green: "rgb(166, 227, 161)",
    selectionBackground: "rgba(137, 180, 250, 0.3)",
    blue: undefined,
  });
});

it("does not reuse a preceding color when a theme token is invalid", () => {
  const styles = document.createElement("div").style;
  styles.setProperty("--terminal-red", "#f38ba8");
  styles.setProperty("--terminal-green", "invalid-color");
  expect(terminalTheme(styles)).toMatchObject({
    red: "rgb(243, 139, 168)",
    green: undefined,
  });
});
