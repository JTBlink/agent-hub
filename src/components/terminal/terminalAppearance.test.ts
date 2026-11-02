// @vitest-environment jsdom
import { expect, it } from "vitest";
import { terminalAppearance } from "./terminalAppearance";

it("combines shared font metrics with terminal rendering options", () => {
  const styles = document.createElement("div").style;
  styles.setProperty("--font-size-terminal", "15px");
  expect(terminalAppearance(styles)).toMatchObject({
    fontSize: 15,
    fontWeight: "500",
    fontWeightBold: "700",
    minimumContrastRatio: 4.5,
    customGlyphs: true,
    cursorStyle: "bar",
  });
});
