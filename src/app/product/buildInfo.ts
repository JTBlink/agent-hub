import { invoke } from "@tauri-apps/api/core";
import { productConfig } from "@app/product";

interface BuildInfo {
  product_id: string;
  config_hash: string;
  features: string[];
}

/** Refuse mismatched desktop assets before any application providers start. */
export async function verifyBuildInfo(): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return;
  const backend = await invoke<BuildInfo>("get_build_info");
  if (
    backend.product_id !== productConfig.id ||
    backend.config_hash !== productConfig.hash ||
    [...backend.features].sort().join(",") !==
      [...productConfig.features].sort().join(",")
  ) {
    throw new Error(
      "Application resources do not match this product build. Rebuild or reinstall the application.",
    );
  }
}
