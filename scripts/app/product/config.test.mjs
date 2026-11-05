import { describe, expect, it } from "vitest";
import { resolveProduct, productArguments } from "./config.mjs";

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
