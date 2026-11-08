import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { it, expect } from "vitest";
import { JSDOM } from "jsdom";

it("builds a self-contained website with the current version and all local assets", () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), "agenthub-homepage-"));
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const outputPath = join(outputDirectory, "nested", "index.html");
  try {
    execFileSync(process.execPath, [
      join(root, "scripts/website/build-homepage.mjs"),
      outputPath,
    ]);
    const html = readFileSync(outputPath, "utf8");
    expect(html).toContain(readFileSync(join(root, "VERSION"), "utf8").trim());
    expect(html).not.toContain("__APP_VERSION__");
    expect(html).not.toContain("__PRODUCT_PREVIEWS__");
    const document = new JSDOM(html).window.document;
    expect(
      document.querySelector('link[rel="icon"]').getAttribute("href"),
    ).toBe("./assets/app-icon-32.png");
    for (const image of document.querySelectorAll(".brand img")) {
      expect(image.getAttribute("src")).toBe("./assets/app-icon-128.png");
    }
    for (const [asset, source] of [
      ["app-icon-32.png", "32x32.png"],
      ["app-icon-128.png", "128x128.png"],
    ]) {
      expect(readFileSync(join(dirname(outputPath), "assets", asset))).toEqual(
        readFileSync(join(root, "src-tauri/icons/variants/dark", source)),
      );
    }
    const canonical = document.querySelector('link[rel="canonical"]').href;
    expect(canonical).toBe("https://jtblink.github.io/agent-hub/");
    expect(document.title).toContain("编程工作台");
    expect(document.title).toContain("AI Native");
    expect(
      document.querySelector('meta[property="og:image"]').content,
    ).toContain("project-workspace.png");
    const schema = JSON.parse(
      document.querySelector('script[type="application/ld+json"]').textContent,
    );
    expect(
      schema["@graph"].find((item) => item["@type"] === "SoftwareApplication"),
    ).toMatchObject({
      name: "AgentHub",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Windows, Linux",
    });
    const sitemap = new JSDOM(
      readFileSync(join(dirname(outputPath), "sitemap.xml"), "utf8"),
      { contentType: "application/xml" },
    ).window.document;
    expect(
      [...sitemap.querySelectorAll("loc")].map((node) => node.textContent),
    ).toEqual([
      `${canonical}sitemap-pages.xml`,
      `${canonical}docs/sitemap.xml`,
    ]);
    const pages = new JSDOM(
      readFileSync(join(dirname(outputPath), "sitemap-pages.xml"), "utf8"),
      { contentType: "application/xml" },
    ).window.document;
    expect(pages.querySelector("loc").textContent).toBe(canonical);
    for (const [, resource] of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) {
      expect(existsSync(join(dirname(outputPath), resource)), resource).toBe(
        true,
      );
    }
    // PNG signatures ensure screenshots are actual images, not unresolved links.
    for (const filename of [
      "skill-library.png",
      "dashboard.png",
      "project-workspace.png",
      "git.png",
      "tasks.png",
      "automation.png",
    ]) {
      expect(
        readFileSync(join(dirname(outputPath), "assets", filename))
          .subarray(0, 8)
          .toString("hex"),
      ).toBe("89504e470d0a1a0a");
    }
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});
