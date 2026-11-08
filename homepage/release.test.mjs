import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { expect, it } from "vitest";

const script = readFileSync(new URL("./release.js", import.meta.url), "utf8");
const template = readFileSync(new URL("./index.html", import.meta.url), "utf8");

async function render(fetch) {
  const { window } = new JSDOM(template.replaceAll("__APP_VERSION__", "0.1.0"));
  await runInNewContext(script, {
    document: window.document,
    fetch,
    AbortSignal,
  });
  return window.document;
}

it("shows the latest published version and its release link without rebuilding", async () => {
  const document = await render(async () => ({
    ok: true,
    json: async () => ({ tag_name: "v0.2.0", draft: false, prerelease: false }),
  }));
  expect(document.querySelector("[data-release-version]").textContent).toBe(
    "0.2.0",
  );
  expect(document.querySelector("[data-release-label]").textContent).toBe(
    "最新版本",
  );
  expect(document.querySelector("[data-release-note]").textContent).toContain(
    "0.2.0",
  );
  expect(document.querySelector("[data-release-link]").href).toBe(
    "https://github.com/JTBlink/agent-hub/releases/tag/v0.2.0",
  );
});

it.each([
  async () => {
    throw new Error("request timed out");
  },
  async () => ({ ok: false }),
  async () => ({
    ok: true,
    json: async () => ({
      tag_name: "invalid",
      draft: false,
      prerelease: false,
    }),
  }),
  async () => ({
    ok: true,
    json: async () => ({ tag_name: "v0.2.0", draft: false, prerelease: true }),
  }),
])(
  "preserves the static page when a release cannot be used (%#)",
  async (fetch) => {
    const document = await render(fetch);
    expect(document.querySelector("[data-release-version]").textContent).toBe(
      "0.1.0",
    );
    expect(document.querySelector("[data-release-label]").textContent).toBe(
      "开发版本",
    );
    expect(document.querySelector("[data-release-link]").href).toBe(
      "https://github.com/JTBlink/agent-hub/releases",
    );
  },
);
