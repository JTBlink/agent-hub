import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { it, expect } from "vitest";

it("builds a self-contained website with the current version and all local assets", () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), "agenthub-homepage-"));
  const root = fileURLToPath(new URL("../", import.meta.url));
  const outputPath = join(outputDirectory, "nested", "index.html");
  try {
    execFileSync(process.execPath, [
      join(root, "scripts/build-homepage.mjs"),
      outputPath,
    ]);
    const html = readFileSync(outputPath, "utf8");
    expect(html).toContain(readFileSync(join(root, "VERSION"), "utf8").trim());
    expect(html).not.toContain("__APP_VERSION__");
    for (const [, resource] of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) {
      expect(existsSync(join(dirname(outputPath), resource)), resource).toBe(
        true,
      );
    }
    // PNG signatures ensure screenshots are actual images, not unresolved links.
    for (const filename of ["skill-library.png", "dashboard.png"]) {
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
