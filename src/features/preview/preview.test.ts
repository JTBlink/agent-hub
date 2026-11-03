// @vitest-environment jsdom
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
const styles = readFileSync("src/features/preview/preview.css", "utf8");

it("keeps close buttons the same color when the selected tab changes", () => {
  const style = document.createElement("style");
  style.textContent = styles;
  const host = document.createElement("section");
  host.className = "preview-workspace";
  host.innerHTML =
    '<div class="preview-tabs"><div><button>Page</button><button class="preview-tab-close">×</button></div><div class="active"><button>Document</button><button class="preview-tab-close">×</button></div></div>';
  document.head.append(style);
  document.body.append(host);
  try {
    const tabs = [...host.querySelectorAll(".preview-tabs > div")];
    const buttons = [...host.querySelectorAll(".preview-tab-close")];
    for (const tab of tabs) {
      tabs.forEach((item) => item.classList.toggle("active", item === tab));
      expect(getComputedStyle(tabs[0]).color).not.toBe(
        getComputedStyle(tabs[1]).color,
      );
      expect(getComputedStyle(buttons[0]).color).toBe(
        getComputedStyle(buttons[1]).color,
      );
    }
  } finally {
    style.remove();
    host.remove();
  }
});
