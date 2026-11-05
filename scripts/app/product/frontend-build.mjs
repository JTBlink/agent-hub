import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { repositoryRoot as ROOT } from "../../shared/paths.mjs";
import { loadProduct, prepareProduct, productArguments } from "./config.mjs";

/** Build only the selected frontend import graph, preserving legacy standard dist. */
export function main(
  argv = process.argv.slice(2),
  { runner = spawnSync, env = process.env } = {},
) {
  const { selection, args } = productArguments(
    argv,
    env.AGENT_HUB_PRODUCT_CONFIG || env.AGENT_HUB_PRODUCT || "standard",
  );
  if (args.length) throw new Error("Frontend build accepts only --product");
  const selected =
    argv.some((arg) => arg === "--product" || arg.startsWith("--product=")) ||
    !!env.AGENT_HUB_PRODUCT_HASH;
  const product = loadProduct(selection, { env });
  if (!selected) {
    product.hash = "development";
    product.generatedDir = resolve(
      ROOT,
      "node_modules/.cache/agent-hub/products/legacy-standard",
    );
    product.environment.AGENT_HUB_PRODUCT_TS = resolve(
      product.generatedDir,
      "product.ts",
    );
  }
  prepareProduct(product);
  const buildEnv = {
    ...product.environment,
    AGENT_HUB_PRODUCT_HASH: product.hash,
    AGENT_HUB_PRODUCT_OUTPUT_DIR: selected
      ? product.frontendDist
      : resolve(ROOT, "dist"),
  };
  for (const [program, arguments_] of [
    [
      resolve(ROOT, "node_modules/typescript/bin/tsc"),
      ["-p", resolve(product.generatedDir, "tsconfig.product.json")],
    ],
    [resolve(ROOT, "node_modules/vite/bin/vite.js"), ["build"]],
  ]) {
    const result = runner(process.execPath, [program, ...arguments_], {
      cwd: ROOT,
      stdio: "inherit",
      env: buildEnv,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = main();
