// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { verifyBuildInfo } from "./buildInfo";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@app/product", () => ({
  productConfig: { id: "custom", hash: "expected", features: [] },
}));
afterEach(() => {
  vi.clearAllMocks();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

it("allows browser fixtures without calling a desktop backend", async () => {
  await verifyBuildInfo();
  expect(invoke).not.toHaveBeenCalled();
});

it("rejects resources from a different product before application initialization", async () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  vi.mocked(invoke).mockResolvedValueOnce({
    product_id: "standard",
    config_hash: "expected",
    features: [],
  });
  await expect(verifyBuildInfo()).rejects.toThrow("do not match");
});

it("accepts matching desktop and frontend build identities", async () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  vi.mocked(invoke).mockResolvedValueOnce({
    product_id: "custom",
    config_hash: "expected",
    features: [],
  });
  await expect(verifyBuildInfo()).resolves.toBeUndefined();
});
