import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { expect, it, vi } from "vitest";

it("switches screenshots and returns the automation shortcut to its matching preview", () => {
  const { window } = new JSDOM(
    readFileSync(new URL("./index.html", import.meta.url), "utf8").replace(
      "__PRODUCT_PREVIEWS__",
      readFileSync(
        new URL("./partials/previews.html", import.meta.url),
        "utf8",
      ),
    ),
  );
  const document = window.document;
  const scroll = vi.fn();
  document.querySelector(".workbench").scrollIntoView = scroll;
  runInNewContext(
    readFileSync(new URL("./preview.js", import.meta.url), "utf8"),
    { document },
  );
  expect(document.querySelector(".preview-controls").hidden).toBe(false);
  for (const button of document.querySelectorAll("[data-preview]")) {
    button.click();
    expect(
      [...document.querySelectorAll(".product-preview")]
        .filter((node) => !node.hidden)
        .map((node) => node.id),
    ).toEqual([`preview-${button.dataset.preview}`]);
    expect(
      document.querySelectorAll('[data-preview][aria-pressed="true"]').length,
    ).toBe(1);
  }
  document.querySelector("[data-show-preview]").click();
  expect(document.querySelector("#preview-automation").hidden).toBe(false);
  expect(document.activeElement.dataset.preview).toBe("automation");
  expect(scroll).toHaveBeenCalledOnce();
});
