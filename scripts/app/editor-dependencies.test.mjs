import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { optimizeDeps, resolveConfig } from "vite";

it("prebundles lazy editor languages before the first Python or JSON file is opened", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "agenthub-editor-deps-"));
  try {
    const config = await resolveConfig(
      {
        cacheDir,
        logLevel: "silent",
        // A generated product entry may hide lazy imports from the initial scan.
        optimizeDeps: { entries: [], noDiscovery: true },
      },
      "serve",
    );
    const metadata = await optimizeDeps(config);
    for (const dependency of [
      "@codemirror/lang-python",
      "@codemirror/lang-json",
      "@codemirror/legacy-modes/mode/clike",
    ]) {
      expect(metadata.optimized[dependency], dependency).toBeDefined();
    }
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}, 30_000);
