import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const [, , input, ...options] = process.argv;
if (!input?.endsWith(".tar.gz") || options.some((arg) => arg !== "--native"))
  throw new Error(
    "Usage: node packages/agent-hub-core/smoke.mjs <archive.tar.gz> [--native]",
  );
const archive = resolve(input);
const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
if (
  readFileSync(archive + ".sha256", "utf8").trimEnd() !==
  `${digest}  ${basename(archive)}`
)
  throw new Error("SDK archive digest mismatch");
const metadata = JSON.parse(
  readFileSync(`${archive.slice(0, -".tar.gz".length)}-manifest.json`, "utf8"),
);
if (metadata.file !== basename(archive) || metadata.sha256 !== digest)
  throw new Error("SDK manifest does not match the archive");

const stage = mkdtempSync(join(tmpdir(), "agenthub-sdk-smoke-"));
try {
  const sdk = join(stage, "agent-hub-core");
  const lock = join(stage, "sdk-lock.json");
  writeFileSync(
    lock,
    JSON.stringify({
      source: archive,
      version: metadata.version,
      revision: metadata.revision,
      sha256: digest,
    }),
  );
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./install.mjs", import.meta.url)), lock, sdk],
    { stdio: "inherit" },
  );
  for (const [file, expected] of Object.entries({
    SDK_VERSION: metadata.version,
    SDK_REVISION: metadata.revision,
    VERSION: metadata.appVersion,
  })) {
    if (readFileSync(join(sdk, file), "utf8").trim() !== expected)
      throw new Error(`SDK manifest does not match ${file}`);
  }
  const run = (binary, args) =>
    execFileSync(binary, args, { cwd: sdk, stdio: "inherit" });
  const { loadProduct } = await import(
    pathToFileURL(join(sdk, "packages/agent-hub-core/build/config.mjs"))
  );
  const template = JSON.parse(
    readFileSync(join(sdk, "products/agent-flow.json"), "utf8"),
  );
  run("npm", ["ci", "--no-audit", "--no-fund"]);
  mkdirSync(join(sdk, "custom"));
  const products = [
    {
      id: "agent-flow",
      version: "2.4.0",
      panel: "review-workbench",
      features: ["cloud-sync", "github", "gitlab", "herdr"],
    },
    {
      id: "sample-product",
      version: "1.3.0",
      panel: "team-home",
      features: ["gitlab"],
    },
  ];
  for (const { panel } of products) {
    writeFileSync(
      join(sdk, "custom", `${panel}.tsx`),
      `import type { FeatureModule } from "@app/features";\n` +
        `export default { id: "${panel}", sidebar: { id: "${panel}", kind: "panel", labelKey: "${panel}", icon: () => null, component: () => <p>${panel}</p> } } satisfies FeatureModule;\n`,
    );
  }
  for (const { id, version, panel, features } of products) {
    const modulePath = `custom/${panel}.tsx`;
    const manifest = join(stage, `${id}.json`);
    writeFileSync(
      manifest,
      JSON.stringify({
        ...template,
        id,
        version,
        features,
        sidebarModules: { [panel]: modulePath },
        sidebar: {
          ...template.sidebar,
          primary: [...template.sidebar.primary, panel],
        },
      }),
    );
    run("npm", ["run", "build", "--", "--product", manifest]);
    const product = loadProduct(manifest);
    const report = JSON.parse(
      readFileSync(join(product.frontendDist, "product-build.json"), "utf8"),
    );
    if (
      report.product_id !== id ||
      report.version !== version ||
      JSON.stringify(report.features) !== JSON.stringify(features) ||
      JSON.stringify(
        report.modules.filter((path) => path.startsWith("custom/")),
      ) !== JSON.stringify([modulePath])
    )
      throw new Error(`Unexpected product build contents: ${id}`);
    if (options.includes("--native")) {
      execFileSync(
        "cargo",
        [
          "check",
          "--locked",
          "--manifest-path",
          "src-tauri/Cargo.toml",
          "--no-default-features",
          "--features",
          features.join(","),
          "--lib",
          "--bin",
          "agent-hub-cli",
        ],
        {
          cwd: sdk,
          stdio: "inherit",
          env: {
            ...product.environment,
            CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR
              ? resolve(process.env.CARGO_TARGET_DIR)
              : join(stage, "cargo-target"),
          },
        },
      );
    }
    process.stdout.write(`${id}: SDK product verified\n`);
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}
