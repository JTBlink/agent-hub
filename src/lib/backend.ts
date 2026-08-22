import { invoke } from "@tauri-apps/api/core";

export interface AppInfo {
  name: string;
  version: string;
}

export interface StorageDiagnostics {
  databasePath: string;
  schemaVersion: number;
  journalMode: string;
  foreignKeysEnabled: boolean;
  forbiddenSchemaColumns: string[];
}

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("app_info");
}

export function getStorageDiagnostics(): Promise<StorageDiagnostics> {
  return invoke<StorageDiagnostics>("storage_diagnostics");
}
