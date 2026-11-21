import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { optimizeDeps, resolveConfig } from "vite";

it("prebundles editor core and lazy languages with compatible extension identities", async () => {
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
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
      "@codemirror/commands",
      "@codemirror/search",
      "@lezer/highlight",
    ]) {
      expect(metadata.optimized[dependency], dependency).toBeDefined();
    }
    // Native ESM imports exercise the generated chunks, independently of Vitest's resolver.
    execFileSync(process.execPath, [
      "--input-type=module",
      "-e",
      `import assert from "node:assert/strict";
       import { pathToFileURL } from "node:url";
       const [state, language, python, javascript] = await Promise.all(
         process.argv.slice(1).map(path => import(pathToFileURL(path).href)));
       for (const support of [python.python(), javascript.javascript({typescript: true})]) {
         const editor = state.EditorState.create({doc: "", extensions: support});
         assert.equal(editor.facet(language.language), support.language);
       }`,
      ...[
        "@codemirror/state",
        "@codemirror/language",
        "@codemirror/lang-python",
        "@codemirror/lang-javascript",
      ].map((dependency) => metadata.optimized[dependency].file),
    ]);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}, 30_000);
