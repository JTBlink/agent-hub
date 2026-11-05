import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve, isAbsolute, dirname, basename } from "node:path";
import { repositoryRoot } from "../../shared/paths.mjs";
import { cargoTargetDir } from "../build-cache.mjs";

const ROOT = repositoryRoot;
const modules = new Set([
  "projects",
  "search",
  "git",
  "tasks",
  "automation",
  "preview",
  "skills",
  "discover",
  "herdr",
  "dashboard",
  "backup",
  "settings",
]);
const panels = new Set(["projects", "search", "skills", "herdr"]);

/** Resolve the same additive feature graph Cargo uses; defaults are never implicit. */
export function resolveProduct(input, cargoFeatures) {
  if (
    !input ||
    typeof input !== "object" ||
    !/^[a-z][a-z0-9-]*$/.test(input.id ?? "")
  )
    throw new Error("Invalid product ID");
  if (
    !Array.isArray(input.features) ||
    !input.features.every((name) => typeof name === "string")
  )
    throw new Error("Invalid product features");
  const selected = new Set();
  const visit = (name) => {
    if (!(name in cargoFeatures))
      throw new Error(`Unknown Cargo feature: ${name}`);
    if (selected.has(name)) return;
    selected.add(name);
    for (const dependency of cargoFeatures[name]) {
      if (!dependency.startsWith("dep:") && !dependency.includes("/"))
        visit(dependency);
    }
  };
  input.features.forEach(visit);
  const sidebar = input.sidebar;
  if (
    !sidebar ||
    !Array.isArray(sidebar.primary) ||
    !Array.isArray(sidebar.bottom)
  )
    throw new Error("Invalid product sidebar");
  const entries = [...sidebar.primary, ...sidebar.bottom];
  if (
    entries.some((id) => !modules.has(id)) ||
    new Set(entries).size !== entries.length
  )
    throw new Error("Unknown or duplicate sidebar module");
  if (entries.includes("herdr") && !selected.has("herdr"))
    throw new Error("Herdr sidebar requires the herdr Cargo feature");
  if (
    !panels.has(sidebar.defaultPanel) ||
    !entries.includes(sidebar.defaultPanel)
  )
    throw new Error("Default sidebar panel must be an enabled panel");
  return {
    id: input.id,
    features: [...selected].sort(),
    devPort:
      input.devPort ??
      (input.id === "standard"
        ? 1420
        : input.id === "personal"
          ? 1421
          : 15000 +
            (parseInt(
              createHash("sha256").update(input.id).digest("hex").slice(0, 4),
              16,
            ) %
              10000)),
    sidebar: {
      primary: [...sidebar.primary],
      bottom: [...sidebar.bottom],
      defaultPanel: sidebar.defaultPanel,
    },
  };
}

/** Remove this wrapper's selection option before forwarding arguments. */
export function productArguments(
  args,
  fallback = process.env.AGENT_HUB_PRODUCT || "standard",
) {
  let selection = fallback;
  let seen = false;
  const forwarded = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--product" || arg.startsWith("--product=")) {
      if (seen) throw new Error("Product may be selected only once");
      seen = true;
      selection = arg === "--product" ? args[++index] : arg.slice(10);
      if (!selection || selection.startsWith("--"))
        throw new Error("--product requires a value");
    } else forwarded.push(arg);
  }
  return { selection, args: forwarded };
}

function cargoFeatureGraph() {
  const metadata = JSON.parse(
    execFileSync(
      "cargo",
      [
        "metadata",
        "--manifest-path",
        resolve(ROOT, "src-tauri/Cargo.toml"),
        "--no-deps",
        "--offline",
        "--format-version",
        "1",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  const packageInfo = metadata.packages.find(
    (entry) => entry.manifest_path === resolve(ROOT, "src-tauri/Cargo.toml"),
  );
  if (!packageInfo) throw new Error("Application Cargo package was not found");
  return packageInfo.features;
}

export function loadProduct(
  selection = "standard",
  { env = process.env, cargoFeatures, baseCommit } = {},
) {
  const configPath =
    isAbsolute(selection) ||
    selection.includes("/") ||
    selection.endsWith(".json")
      ? resolve(ROOT, selection)
      : resolve(ROOT, "products", `${selection}.json`);
  const config = resolveProduct(
    JSON.parse(readFileSync(configPath, "utf8")),
    cargoFeatures ?? cargoFeatureGraph(),
  );
  if (
    !Number.isInteger(config.devPort) ||
    config.devPort < 1024 ||
    config.devPort > 65535
  )
    throw new Error("Invalid product development port");
  const hash = createHash("sha256")
    .update(JSON.stringify(config))
    .digest("hex");
  const key = `${config.id}-${hash.slice(0, 12)}`;
  const generatedDir = resolve(
    ROOT,
    "node_modules/.cache/agent-hub/products",
    key,
  );
  const frontendDist = resolve(generatedDir, "dist");
  const baseTarget = cargoTargetDir(ROOT, env);
  const targetDir =
    config.id === "standard"
      ? baseTarget
      : resolve(dirname(baseTarget), `${basename(baseTarget)}-products`, key);
  baseCommit ??= execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const product = {
    ...config,
    hash,
    baseCommit,
    configPath,
    generatedDir,
    frontendDist,
    targetDir,
    binariesDir: resolve(generatedDir, "binaries"),
  };
  product.environment = {
    ...env,
    AGENT_HUB_PRODUCT: selection,
    AGENT_HUB_PRODUCT_ID: config.id,
    AGENT_HUB_PRODUCT_CONFIG: configPath,
    AGENT_HUB_PRODUCT_HASH: hash,
    AGENT_HUB_PRODUCT_FEATURES: config.features.join(","),
    AGENT_HUB_BASE_COMMIT: baseCommit,
    AGENT_HUB_PRODUCT_DIR: generatedDir,
    AGENT_HUB_DEV_PORT: String(config.devPort),
    AGENT_HUB_PRODUCT_OUTPUT_DIR: frontendDist,
    AGENT_HUB_PRODUCT_TS: resolve(generatedDir, "product.ts"),
    CARGO_TARGET_DIR: targetDir,
    ...(config.id === "standard"
      ? {}
      : { AGENT_HUB_CLI_BIN_DIR: resolve(generatedDir, "bin") }),
  };
  return product;
}

function writeGenerated(path, content) {
  try {
    if (readFileSync(path, "utf8") === content) return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const staged = `${path}.${process.pid}.tmp`;
  writeFileSync(staged, content);
  renameSync(staged, path);
}

/** Build inputs live in an ignored, product-specific directory and are reproducible. */
export function prepareProduct(product) {
  mkdirSync(product.generatedDir, { recursive: true });
  mkdirSync(product.binariesDir, { recursive: true });
  const config = {
    id: product.id,
    features: product.features,
    sidebar: product.sidebar,
    hash: product.hash,
    baseCommit: product.baseCommit,
  };
  writeGenerated(
    resolve(product.generatedDir, "product.ts"),
    `export const productConfig = ${JSON.stringify(config, null, 2)} as const;\n`,
  );
  writeGenerated(
    resolve(product.generatedDir, "build-info.json"),
    JSON.stringify(config, null, 2) + "\n",
  );
  writeGenerated(
    resolve(product.generatedDir, "features.ts"),
    `import type { FeatureModule } from ${JSON.stringify(resolve(ROOT, "src/app/features/types"))};\n` +
      (product.features.includes("herdr")
        ? `import { herdrModule } from ${JSON.stringify(resolve(ROOT, "src/features/herdr/module"))};\n`
        : "") +
      `export const featureModules: readonly FeatureModule[] = [${product.features.includes("herdr") ? "herdrModule" : ""}];\n`,
  );
  const integration = resolve(
    ROOT,
    product.features.includes("herdr")
      ? "src/features/herdr/integration.ts"
      : "src/integrations/herdr/disabled.ts",
  );
  writeGenerated(
    resolve(product.generatedDir, "tsconfig.product.json"),
    JSON.stringify(
      {
        extends: resolve(ROOT, "tsconfig.app.json"),
        compilerOptions: {
          tsBuildInfoFile: resolve(product.generatedDir, "app.tsbuildinfo"),
          baseUrl: ROOT,
          paths: {
            "@app/features": [resolve(product.generatedDir, "features.ts")],
            "@app/herdr": [integration],
            "@app/product": [resolve(product.generatedDir, "product.ts")],
          },
        },
        files: [resolve(ROOT, "src/main.tsx")],
        include: [],
        exclude: [],
      },
      null,
      2,
    ) + "\n",
  );
  writeGenerated(
    resolve(product.generatedDir, "tauri.product.conf.json"),
    JSON.stringify(
      {
        build: {
          frontendDist: product.frontendDist,
          beforeBuildCommand: "",
          beforeDevCommand: `npm run dev -- --port ${product.devPort} --strictPort`,
          devUrl: `http://127.0.0.1:${product.devPort}`,
        },
        ...(product.id === "standard"
          ? {}
          : {
              identifier: `com.jtstudio.agenthub.${product.id}`,
              productName:
                product.id === "personal"
                  ? "AgentHub Personal"
                  : `AgentHub ${product.id}`,
              app: {
                windows: [
                  {
                    title:
                      product.id === "personal"
                        ? "AgentHub Personal"
                        : `AgentHub ${product.id}`,
                    maximized: true,
                    minWidth: 1100,
                    minHeight: 640,
                    resizable: true,
                    decorations: true,
                    titleBarStyle: "Overlay",
                    hiddenTitle: true,
                  },
                ],
              },
            }),
        bundle: {
          externalBin: [resolve(product.binariesDir, "agent-hub-cli")],
        },
      },
      null,
      2,
    ) + "\n",
  );
  return product;
}

export function cargoProductArguments(product) {
  return [
    "--no-default-features",
    ...(product.features.length
      ? ["--features", product.features.join(",")]
      : []),
  ];
}
