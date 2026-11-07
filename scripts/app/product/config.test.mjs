import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveProduct,
  productArguments,
  loadProduct,
  prepareProduct,
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
    expect(product.features).toContain("gitlab");
    expect(product.features).not.toContain("github");
    expect(config.app.windows[0].title).toBe("Agent Flow");
    expect(product.features).toEqual(
      [...featureCatalog.products["agent-flow"]].sort(),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
