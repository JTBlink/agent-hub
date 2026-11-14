import { invoke } from "@tauri-apps/api/core";

export const getSettings = (key: string) =>
  invoke<string | null>("get_settings", { key });

export const setSettings = (key: string, value: string) =>
  invoke<void>("set_settings", { key, value });
