import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createServer } from "vite";
import { afterEach, expect, it, vi } from "vitest";
import { loadProduct, prepareProduct } from "./config.mjs";
import { productViteConfig } from "./vite-plugin.mjs";

const directories = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "agenthub-feature-vite-")),
  );
  directories.push(root);
  const path = join(root, "product.json");
  writeFileSync(
    path,
    JSON.stringify({
      id: "vite-feature-fixture",
      features: [],
      sidebar: {
        primary: ["projects"],
        bottom: ["settings"],
        defaultPanel: "projects",
      },
    }),
  );
  vi.stubEnv("AGENT_HUB_PRODUCT_CONFIG", path);
  directories.push(loadProduct(path).generatedDir);
  return { root, path };
}

it("keeps lazy feature modules on the same application context as the workbench", async () => {
  const { root } = fixture();
  vi.stubEnv("AGENT_HUB_PRODUCT_HASH", "development");
  vi.stubEnv("AGENT_HUB_PRODUCT_TS", join(root, "generated/product.ts"));
  const product = productViteConfig(root);
  for (const alias of ["@app/features", "@app/platforms", "@app/product"])
    expect(dirname(product.resolve.alias[alias])).toBe(join(root, "generated"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "node_modules/.cache"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{"type":"module"}');
  writeFileSync(join(root, "src/context.js"), "export const context = {};\n");
  writeFileSync(
    join(root, "src/Herdr.js"),
    'export { context } from "./context.js";\n',
  );
  writeFileSync(
    join(root, "src/main.js"),
    'import { context } from "./context.js"; import { load } from "@app/features"; export const check = async () => context === (await load()).context;\n',
  );
  writeFileSync(
    join(root, "node_modules/.cache/features.js"),
    'export const load = () => import("../../src/Herdr.js");\n',
  );
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    cacheDir: join(root, "cache"),
    resolve: {
      alias: { "@app/features": join(root, "node_modules/.cache/features.js") },
    },
    optimizeDeps: {
      ...product.optimizeDeps,
      entries: [join(root, "src/main.js")],
    },
    server: { host: "127.0.0.1", port: 0 },
  });
  try {
    await server.listen();
    const main = await server.transformRequest("/src/main.js");
    expect(main.code).toContain("/node_modules/.cache/features.js");
    expect(main.code).not.toMatch(/\/deps\/@app_features/);
    const entry = await server.transformRequest(
      "/node_modules/.cache/features.js",
    );
    expect(entry.code).toContain("/src/Herdr.js");
    const feature = await server.transformRequest("/src/Herdr.js");
    expect(main.code).toContain("/src/context.js");
    expect(feature.code).toContain("/src/context.js");
  } finally {
    await server.close();
  }
});

it("does not overwrite compiled product metadata when a standalone dev server starts", () => {
  const { root, path } = fixture();
  const compiled = loadProduct(path);
  directories.push(compiled.generatedDir);
  prepareProduct(compiled);
  const original = readFileSync(
    join(compiled.generatedDir, "product.ts"),
    "utf8",
  );
  vi.stubEnv("AGENT_HUB_PRODUCT_HASH", "");
  vi.stubEnv("AGENT_HUB_PRODUCT_TS", "");
  const development = productViteConfig(root);
  const developmentFile = development.resolve.alias["@app/product"];
  if (dirname(developmentFile) !== compiled.generatedDir)
    directories.push(dirname(developmentFile));
  expect(readFileSync(join(compiled.generatedDir, "product.ts"), "utf8")).toBe(
    original,
  );
  expect(developmentFile).not.toBe(join(compiled.generatedDir, "product.ts"));
});
