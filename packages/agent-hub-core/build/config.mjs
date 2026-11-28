import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { resolve, isAbsolute, dirname, basename } from "node:path";
import { repositoryRoot } from "../../../scripts/shared/paths.mjs";
import { cargoTargetDir } from "../../../scripts/shared/cargo-target.mjs";
import workbenchCatalog from "../../../products/workbench.json" with { type: "json" };
import { resolveWorkbench } from "./workbench.mjs";

const ROOT = repositoryRoot;
export const DEFAULT_CLI_NAME = "agent-hub-cli";
const COMPANION_CLI_FEATURE = "companion-cli";
export const featureCatalog = JSON.parse(
  readFileSync(resolve(ROOT, "products/features.json"), "utf8"),
);
export function featureAliases(root, features) {
  return Object.fromEntries(
    Object.entries(featureCatalog.features).flatMap(([id, featureDefinition]) =>
      Object.entries(featureDefinition.aliases ?? {}).map(([alias, paths]) => [
        alias,
        resolve(
          root,
          features.includes(id) &&
            (paths.requires ?? []).every((required) =>
              features.includes(required),
            )
            ? paths.enabled
            : paths.disabled,
        ),
      ]),
    ),
  );
}

export function discoverPagePath(root, product) {
  return resolve(
    root,
    product.pageOverrides?.discover ?? "src/views/Discover.tsx",
  );
}

const modules = new Set(Object.keys(workbenchCatalog.modules));
const panels = new Set(
  Object.keys(workbenchCatalog.modules).filter(
    (id) => workbenchCatalog.modules[id].panel,
  ),
);

function resolveFeatures(features, cargoFeatures) {
  if (
    !Array.isArray(features) ||
    !features.every((name) => typeof name === "string")
  )
    throw new Error("Invalid product features");
  const selected = new Set();
  const visit = (name) => {
    if (name === COMPANION_CLI_FEATURE || !(name in cargoFeatures))
      throw new Error(`Unknown Cargo feature: ${name}`);
    if (selected.has(name)) return;
    selected.add(name);
    for (const dependency of cargoFeatures[name]) {
      if (!dependency.startsWith("dep:") && !dependency.includes("/"))
        visit(dependency);
    }
  };
  features.forEach(visit);
  return selected;
}

function moduleEntry(module) {
  return typeof module === "string" ? module : module?.entry;
}

function validModule(id, module, selected) {
  const entry = moduleEntry(module);
  return (
    typeof entry === "string" &&
    !!entry.trim() &&
    (typeof module === "string" ||
      (Object.keys(module).every(
        (key) => key === "entry" || key === "requires" || key === "route",
      ) &&
        (module.route === undefined || module.route === `/custom/${id}`) &&
        (module.requires === undefined ||
          (Array.isArray(module.requires) &&
            module.requires.every((id) => selected.has(id))))))
  );
}

/** Resolve the same additive feature graph Cargo uses; defaults are never implicit. */
export function resolveProduct(input, cargoFeatures) {
  if (
    !input ||
    typeof input !== "object" ||
    !/^[a-z][a-z0-9-]*$/.test(input.id ?? "")
  )
    throw new Error("Invalid product ID");
  if (
    input.productName !== undefined &&
    (typeof input.productName !== "string" || !input.productName.trim())
  )
    throw new Error("Invalid product name");
  if (
    input.cliName !== undefined &&
    (typeof input.cliName !== "string" ||
      !/^[a-z][a-z0-9-]*-cli$/.test(input.cliName) ||
      (input.id === "standard" && input.cliName !== DEFAULT_CLI_NAME))
  )
    throw new Error("Invalid product CLI name");
  if (
    input.version !== undefined &&
    (typeof input.version !== "string" ||
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(input.version) ||
      input.version.split(".").some((part) => Number(part) > 65535))
  )
    throw new Error(
      "Product version must contain three integers from 0 to 65535",
    );
  if (
    input.iconDir !== undefined &&
    (typeof input.iconDir !== "string" || !input.iconDir.trim())
  )
    throw new Error("Invalid product icon directory");
  const selected = resolveFeatures(input.features, cargoFeatures);
  const pageOverrides = input.pageOverrides;
  if (
    pageOverrides !== undefined &&
    (!pageOverrides ||
      typeof pageOverrides !== "object" ||
      Array.isArray(pageOverrides) ||
      Object.entries(pageOverrides).some(
        ([id, path]) =>
          !Object.hasOwn(workbenchCatalog.modules, id) ||
          !workbenchCatalog.modules[id].override ||
          typeof path !== "string" ||
          !/^custom\/(?:[\w.-]+\/)*[\w.-]+\.tsx?$/.test(path) ||
          path.split("/").some((part) => part === "." || part === ".."),
      ))
  )
    throw new Error(
      "Invalid pageOverrides: discover must point to a .ts or .tsx file under custom/",
    );
  const sidebarModules = input.sidebarModules ?? {};
  if (
    typeof sidebarModules !== "object" ||
    Array.isArray(sidebarModules) ||
    Object.entries(sidebarModules).some(
      ([id, module]) =>
        modules.has(id) ||
        !/^[a-z][a-z0-9-]*$/.test(id) ||
        !validModule(id, module, selected),
    )
  )
    throw new Error("Invalid custom sidebar modules");
  const sidebar = input.sidebar;
  if (
    !sidebar ||
    !Array.isArray(sidebar.primary) ||
    !Array.isArray(sidebar.bottom)
  )
    throw new Error("Invalid product sidebar");
  const entries = [...sidebar.primary, ...sidebar.bottom];
  if (
    entries.some(
      (id) => !modules.has(id) && !Object.hasOwn(sidebarModules, id),
    ) ||
    new Set(entries).size !== entries.length
  )
    throw new Error("Unknown or duplicate sidebar module");
  for (const [id, featureDefinition] of Object.entries(featureCatalog.features))
    if (
      (featureDefinition.sidebar ?? []).some((entry) =>
        entries.includes(entry),
      ) &&
      !selected.has(id)
    )
      throw new Error(
        `${featureDefinition.description}: sidebar requires the ${id} Cargo feature`,
      );
  if (
    (!panels.has(sidebar.defaultPanel) &&
      !Object.hasOwn(sidebarModules, sidebar.defaultPanel)) ||
    !entries.includes(sidebar.defaultPanel)
  )
    throw new Error("Default sidebar panel must be an enabled panel");
  return {
    id: input.id,
    ...(input.version === undefined ? {} : { version: input.version }),
    ...(input.productName === undefined
      ? {}
      : { productName: input.productName.trim() }),
    ...(input.cliName === undefined ? {} : { cliName: input.cliName }),
    ...(input.iconDir === undefined ? {} : { iconDir: input.iconDir }),
    ...(pageOverrides?.discover ? { pageOverrides } : {}),
    ...(Object.keys(sidebarModules).length ? { sidebarModules } : {}),
    ...resolveWorkbench(input, selected, featureCatalog),
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

function readProductManifest(configPath) {
  const input = JSON.parse(readFileSync(configPath, "utf8"));
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid product configuration");
  if (input.layoutPreset === undefined) return { input };
  const name = input.layoutPreset;
  if (
    typeof name !== "string" ||
    !/^(?:[\w.-]+\/)*[\w.-]+\.json$/.test(name) ||
    name.split("/").some((part) => part === "." || part === "..")
  )
    throw new Error("Product layout preset must be a relative JSON file");
  const layoutPath = resolve(dirname(configPath), name);
  const preset = JSON.parse(readFileSync(layoutPath, "utf8"));
  const fields = ["sidebar", "layout", "appearance", "shortcuts"];
  if (
    !preset ||
    typeof preset !== "object" ||
    Array.isArray(preset) ||
    Object.keys(preset).some((key) => !fields.includes(key))
  )
    throw new Error("Layout preset may only define workbench settings");
  for (const field of fields) {
    if (!Object.hasOwn(preset, field)) continue;
    const values = [preset[field], input[field]].filter(
      (value) => value !== undefined,
    );
    if (
      values.some(
        (value) => !value || typeof value !== "object" || Array.isArray(value),
      )
    )
      throw new Error(`Invalid preset ${field}`);
    input[field] = { ...values[0], ...values[1] };
  }
  return { input, layoutPath };
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
  const graph = cargoFeatures ?? cargoFeatureGraph();
  const { input, layoutPath } = readProductManifest(configPath);
  for (const name of Object.keys(featureCatalog.features))
    if (!(name in graph))
      throw new Error(
        `Feature definition is missing its Cargo feature: ${name}`,
      );
  const config = resolveProduct(
    (() => {
      if (
        !input.sidebar ||
        !Array.isArray(input.sidebar.primary) ||
        !Array.isArray(input.sidebar.bottom)
      )
        throw new Error("Invalid product sidebar");
      const builtin =
        Object.hasOwn(featureCatalog.products, input.id) &&
        configPath === resolve(ROOT, "products", `${input.id}.json`);
      if (!builtin && ["standard", "personal"].includes(input.id))
        throw new Error("External product uses a reserved product ID");
      if (builtin && input.version !== undefined)
        throw new Error("Built-in product versions come from VERSION");
      const features = builtin
        ? featureCatalog.products[input.id]
        : input.features;
      const selected = resolveFeatures(features, graph);
      const disabledEntries = new Set(
        Object.entries(featureCatalog.features).flatMap(
          ([id, featureDefinition]) =>
            selected.has(id) ? [] : (featureDefinition.sidebar ?? []),
        ),
      );
      const sidebar = {
        ...input.sidebar,
        primary: input.sidebar.primary.filter(
          (entry) => !disabledEntries.has(entry),
        ),
        bottom: input.sidebar.bottom.filter(
          (entry) => !disabledEntries.has(entry),
        ),
      };
      if (disabledEntries.has(sidebar.defaultPanel))
        sidebar.defaultPanel =
          sidebar.primary.find((entry) => panels.has(entry)) ?? "skills";
      return {
        ...input,
        features,
        sidebar: input.layout ? input.sidebar : sidebar,
      };
    })(),
    graph,
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
  if (baseCommit === undefined) {
    const packagedRevision = resolve(ROOT, "SDK_REVISION");
    baseCommit = existsSync(packagedRevision)
      ? readFileSync(packagedRevision, "utf8").trim()
      : execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: ROOT,
          encoding: "utf8",
        }).trim();
    if (!/^[0-9a-f]{40,64}$/.test(baseCommit))
      throw new Error("Invalid AgentHub source revision");
  }
  const product = {
    ...config,
    cargoFeatures: graph,
    cliName: config.cliName ?? DEFAULT_CLI_NAME,
    version:
      config.version ?? readFileSync(resolve(ROOT, "VERSION"), "utf8").trim(),
    hash,
    baseCommit,
    configPath,
    layoutPath,
    iconDir: resolve(ROOT, config.iconDir ?? "src-tauri/icons"),
    generatedDir,
    frontendDist,
    targetDir,
    binariesDir: resolve(generatedDir, "binaries"),
  };
  product.environment = {
    ...env,
    AGENT_HUB_ICON_DIR: product.iconDir,
    AGENT_HUB_PRODUCT: selection,
    AGENT_HUB_PRODUCT_ID: config.id,
    AGENT_HUB_PRODUCT_CONFIG: configPath,
    AGENT_HUB_PRODUCT_HASH: hash,
    AGENT_HUB_PRODUCT_VERSION: product.version,
    AGENT_HUB_PRODUCT_CLI_NAME: product.cliName,
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
export function productBundleIdentifier(id = "standard") {
  const base = "com.jtstudio.agenthub";
  return id === "standard" ? base : `${base}.${id}`;
}

export function prepareProduct(product) {
  mkdirSync(product.generatedDir, { recursive: true });
  mkdirSync(product.binariesDir, { recursive: true });
  const config = {
    id: product.id,
    features: product.features,
    sidebar: product.sidebar,
    layout: product.layout,
    appearance: product.appearance,
    shortcuts: product.shortcuts,
    hash: product.hash,
    baseCommit: product.baseCommit,
    version: product.version,
  };
  writeGenerated(
    resolve(product.generatedDir, "product.ts"),
    `export const productConfig = ${JSON.stringify(config, null, 2)} as const;\n`,
  );
  writeGenerated(
    resolve(product.generatedDir, "build-info.json"),
    JSON.stringify(config, null, 2) + "\n",
  );
  const extensions = Object.entries(product.sidebarModules ?? {});
  const extensionImports = extensions.map(
    ([, module], index) =>
      `import extension${index} from ${JSON.stringify(resolve(ROOT, moduleEntry(module)))};\n`,
  );
  const extensionEntries = extensions.map(
    ([id, module], index) =>
      `[${JSON.stringify(id)}, extension${index}, ${JSON.stringify(module.route ?? null)}]`,
  );
  writeGenerated(
    resolve(product.generatedDir, "features.ts"),
    `import type { FeatureModule } from ${JSON.stringify(resolve(ROOT, "src/app/features/types"))};\n` +
      (product.features.includes("herdr")
        ? `import { herdrModule } from ${JSON.stringify(resolve(ROOT, "src/features/herdr/module"))};\n`
        : "") +
      extensionImports.join("") +
      `export type { FeatureModule };\n` +
      (extensions.length
        ? `const extensions: readonly (readonly [string, FeatureModule, string | null])[] = [${extensionEntries.join(",")}];\n` +
          `for (const [id, feature, route] of extensions) { if (feature.id !== id || feature.sidebar.id !== id) throw new Error("Custom sidebar module ID mismatch: " + id); if (route && !feature.routes?.some((item) => item.path === route)) throw new Error("Custom module route is missing: " + route); }\n`
        : "") +
      `export const featureModules: readonly FeatureModule[] = [${[
        ...(product.features.includes("herdr") ? ["herdrModule"] : []),
        ...(extensions.length
          ? ["...extensions.map(([, feature]) => feature)"]
          : []),
      ].join(",")}];\n`,
  );
  const platforms = Object.keys(featureCatalog.features).filter(
    (name) =>
      featureCatalog.features[name].platform && product.features.includes(name),
  );
  writeGenerated(
    resolve(product.generatedDir, "platforms.ts"),
    `import type { TaskPlatform } from ${JSON.stringify(resolve(ROOT, "src/integrations/platforms/types"))};\n` +
      platforms
        .map(
          (name) =>
            `import { ${name}Platform } from ${JSON.stringify(resolve(ROOT, featureCatalog.features[name].platform))};\n`,
        )
        .join("") +
      `export const taskPlatforms: readonly TaskPlatform[] = [${platforms.map((name) => name + "Platform").join(",")}];\n` +
      `export const githubEnabled = ${platforms.includes("github")};\nexport const gitlabEnabled = ${platforms.includes("gitlab")};\n`,
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
            "@app/discover": [discoverPagePath(ROOT, product)],
            "@app/features": [resolve(product.generatedDir, "features.ts")],
            "@app/herdr": [integration],
            "@app/product": [resolve(product.generatedDir, "product.ts")],
            ...Object.fromEntries(
              Object.entries(featureAliases(ROOT, product.features)).map(
                ([alias, path]) => [alias, [path]],
              ),
            ),
            "@app/platforms": [resolve(product.generatedDir, "platforms.ts")],
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
        version: product.version,
        build: {
          frontendDist: product.frontendDist,
          beforeBuildCommand: "",
          beforeDevCommand: `npm run dev -- --port ${product.devPort} --strictPort`,
          devUrl: `http://127.0.0.1:${product.devPort}`,
        },
        ...(product.id === "standard"
          ? {}
          : {
              identifier: productBundleIdentifier(product.id),
              productName:
                product.productName ??
                (product.id === "personal"
                  ? "AgentHub Personal"
                  : `AgentHub ${product.id}`),
              app: {
                windows: [
                  {
                    title:
                      product.productName ??
                      (product.id === "personal"
                        ? "AgentHub Personal"
                        : `AgentHub ${product.id}`),
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
          icon: [
            "32x32.png",
            "128x128.png",
            "128x128@2x.png",
            "icon.icns",
            "icon.ico",
          ].map((file) => resolve(product.iconDir, file)),
          externalBin: [resolve(product.binariesDir, product.cliName)],
        },
      },
      null,
      2,
    ) + "\n",
  );
  return product;
}

export function cargoCliArguments(product) {
  return [
    "--no-default-features",
    "--features",
    [...product.features, COMPANION_CLI_FEATURE].join(","),
  ];
}
