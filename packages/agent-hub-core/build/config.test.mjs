import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveProduct,
  productArguments,
  loadProduct,
  prepareProduct,
  discoverPagePath,
  featureAliases,
  featureCatalog,
} from "./config.mjs";

const cargoFeatures = { default: ["standard"], standard: ["herdr"], herdr: [] };
const base = {
  id: "sample",
  features: [],
  sidebar: {
    primary: ["projects"],
    bottom: ["settings"],
    defaultPanel: "projects",
  },
};

describe("product build selection", () => {
  it("resolves a Cargo feature closure without enabling defaults", () => {
    expect(resolveProduct(base, cargoFeatures).features).toEqual([]);
    expect(
      resolveProduct({ ...base, features: ["standard"] }, cargoFeatures)
        .features,
    ).toEqual(["herdr", "standard"]);
  });
  it("rejects a sidebar module whose implementation is excluded", () => {
    expect(() =>
      resolveProduct(
        {
          ...base,
          sidebar: { ...base.sidebar, primary: ["projects", "herdr"] },
        },
        cargoFeatures,
      ),
    ).toThrow(/Herdr/);
  });
  it.each([
    { ...base, features: ["unknown"] },
    { ...base, productName: " " },
    { ...base, productName: 42 },
    { ...base, version: "2.4" },
    { ...base, version: "2.4.65536" },
    {
      ...base,
      sidebar: { ...base.sidebar, primary: ["projects", "projects"] },
    },
    { ...base, sidebar: { ...base.sidebar, defaultPanel: "herdr" } },
  ])("rejects invalid product configuration %#", (input) => {
    expect(() => resolveProduct(input, cargoFeatures)).toThrow();
  });
  it("selects a product without forwarding its option to Tauri or Cargo", () => {
    expect(
      productArguments(["build", "--product", "personal", "--debug"]),
    ).toEqual({ selection: "personal", args: ["build", "--debug"] });
    expect(productArguments(["--product=standard"])).toEqual({
      selection: "standard",
      args: [],
    });
    expect(() => productArguments(["--product"])).toThrow(/value/);
  });
});

it("carries the private product version into its build identity and bundle metadata", () => {
  const directory = mkdtempSync(join(tmpdir(), "agenthub-product-version-"));
  try {
    const manifest = join(directory, "product.json");
    writeFileSync(manifest, JSON.stringify({ ...base, version: "2.4.0" }));
    const product = loadProduct(manifest);
    prepareProduct({
      ...product,
      generatedDir: directory,
      binariesDir: join(directory, "bin"),
    });
    expect(product.environment.AGENT_HUB_PRODUCT_VERSION).toBe("2.4.0");
    expect(
      JSON.parse(
        readFileSync(join(directory, "tauri.product.conf.json"), "utf8"),
      ).version,
    ).toBe("2.4.0");
    expect(
      JSON.parse(readFileSync(join(directory, "build-info.json"), "utf8"))
        .version,
    ).toBe("2.4.0");
    writeFileSync(manifest, JSON.stringify({ ...base, version: "2.4.1" }));
    expect(loadProduct(manifest).hash).not.toBe(product.hash);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("loads product features from the central catalog and removes unavailable sidebar entries", () => {
  const standard = loadProduct("standard");
  const personal = loadProduct("personal");
  expect(standard.features).toEqual(
    [...featureCatalog.products.standard].sort(),
  );
  expect(personal.features).toEqual([]);
  expect(standard.sidebar.bottom).toContain("backup");
  expect(personal.sidebar.bottom).not.toContain("backup");
});

it("selects GitHub setup only when both GitHub and cloud sync are compiled", () => {
  for (const features of [
    [],
    ["github"],
    ["cloud-sync"],
    ["gitlab", "cloud-sync"],
  ]) {
    const aliases = featureAliases("/workspace", features);
    expect(aliases["@app/github-backup"]).toContain(
      "integrations/github-backup/disabled.ts",
    );
  }
  expect(
    featureAliases("/workspace", ["github", "cloud-sync"])[
      "@app/github-backup"
    ],
  ).toContain("features/github/cloudIntegration.ts");
});

it("builds Agent Flow with its own application identity and keeps standard outputs isolated", () => {
  const standard = loadProduct("standard");
  const product = loadProduct("agent-flow");
  expect(product.targetDir).not.toBe(standard.targetDir);
  expect(product.frontendDist).not.toBe(standard.frontendDist);
  expect(product.devPort).not.toBe(standard.devPort);
  const directory = mkdtempSync(join(tmpdir(), "agenthub-product-"));
  try {
    prepareProduct({
      ...product,
      generatedDir: directory,
      binariesDir: join(directory, "binaries"),
    });
    const config = JSON.parse(
      readFileSync(join(directory, "tauri.product.conf.json"), "utf8"),
    );
    expect(config.identifier).toBe("com.jtstudio.agenthub.agent-flow");
    expect(config.productName).toBe("Agent Flow");
    expect(
      config.bundle.icon.every((path) =>
        path.includes("products/agent-flow/icons/"),
      ),
    ).toBe(true);
    expect(product.features).toEqual(["gitlab", "herdr"]);
    expect(product.sidebar.bottom).not.toContain("backup");
    expect(standard.features).toContain("cloud-sync");
    expect(config.app.windows[0].title).toBe("Agent Flow");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("lets an external Agent Flow manifest select all shared capabilities", () => {
  const directory = mkdtempSync(join(tmpdir(), "agenthub-external-product-"));
  try {
    const manifest = join(directory, "product.json");
    const builtin = loadProduct("agent-flow");
    const features = [...featureCatalog.products.standard].sort();
    writeFileSync(
      manifest,
      JSON.stringify({ ...base, id: "agent-flow", features }),
    );
    const external = loadProduct(manifest);
    expect(external.id).toBe(builtin.id);
    expect(external.features).toEqual(features);
    expect(external.targetDir).not.toBe(builtin.targetDir);
    writeFileSync(
      manifest,
      JSON.stringify({ ...base, id: "standard", features }),
    );
    expect(() => loadProduct(manifest)).toThrow(/reserved/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("registers a product-owned sidebar module and lets it be the default panel", () => {
  const config = resolveProduct(
    {
      ...base,
      sidebarModules: { review: "custom/review.tsx" },
      sidebar: { primary: ["review"], bottom: [], defaultPanel: "review" },
    },
    cargoFeatures,
  );
  expect(config.sidebar.defaultPanel).toBe("review");
  expect(config.sidebarModules).toEqual({ review: "custom/review.tsx" });
  expect(() =>
    resolveProduct(
      { ...base, sidebarModules: { projects: "custom/review.tsx" } },
      cargoFeatures,
    ),
  ).toThrow(/Invalid custom sidebar modules/);
});

it("selects the built-in discovery page by default and carries an explicit replacement", () => {
  const root = tmpdir();
  expect(discoverPagePath(root, resolveProduct(base, cargoFeatures))).toBe(
    join(root, "src/views/Discover.tsx"),
  );
  const pageOverrides = { discover: "custom/skills/discover.tsx" };
  const product = resolveProduct({ ...base, pageOverrides }, cargoFeatures);
  expect(discoverPagePath(root, product)).toBe(
    join(root, pageOverrides.discover),
  );
});

it.each([
  { settings: "custom/settings.tsx" },
  { discover: "src/views/Discover.tsx" },
  { discover: "custom/../discover.tsx" },
  { discover: "custom/discover.js" },
  null,
])("rejects invalid page replacements %#", (pageOverrides) => {
  expect(() =>
    resolveProduct({ ...base, pageOverrides }, cargoFeatures),
  ).toThrow(/Invalid pageOverrides/);
});
