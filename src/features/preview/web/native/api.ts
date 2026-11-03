import { invoke } from "@tauri-apps/api/core";
export const nativeApi = {
  info: (id?: string) =>
    invoke<{ engine: string; version?: string; userAgent?: string }>(
      "preview_native_info",
      { id },
    ),
};
