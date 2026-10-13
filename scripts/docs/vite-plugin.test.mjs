import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { helpContentPlugin } from "./vite-plugin.mjs";

it("resolves the offline catalog on a direct Vite start with no generated files", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "agenthub-vite-help-")));
  mkdirSync(join(root, "docs/help/zh"), { recursive: true });
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "VERSION"), "0.1.4\n");
  writeFileSync(join(root, "CHANGELOG.md"), "# 更新日志\n\n## [Unreleased]\n");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      type: "module",
      homepage: "https://example.invalid/agent-hub/",
    }),
  );
  writeFileSync(
    join(root, "docs/help/navigation.yml"),
    "categories:\n  - id: start\n    articles: [first]\nfeatured: [first]\n",
  );
  writeFileSync(
    join(root, "docs/help/zh/first.md"),
    "---\nid: first\ntitle: First guide\ndescription: Getting started.\nsince: '0.1.4'\n---\n# First guide\n\nRead offline.\n",
  );
  writeFileSync(
    join(root, "src/entry.ts"),
    'import catalog from "./generated/help/catalog"; export default catalog;\n',
  );
  expect(() =>
    readFileSync(join(root, "src/generated/help/catalog.ts")),
  ).toThrow();
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [helpContentPlugin(root)],
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    await server.listen();
    await expect(
      server.transformRequest("/src/entry.ts"),
    ).resolves.toMatchObject({
      code: expect.stringContaining("generated/help/catalog"),
    });
    expect(
      readFileSync(join(root, "src/generated/help/catalog.ts"), "utf8"),
    ).toContain("Read offline.");
  } finally {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
});
