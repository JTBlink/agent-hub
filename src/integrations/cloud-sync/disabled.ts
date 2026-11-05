import type { RouteObject } from "react-router-dom";
/** Absent capability: no restore query, settings query or backup routes. */
export const cloudSyncEnabled = false;
export const cloudSyncRoutes: readonly RouteObject[] = [];
export function FirstRunRestoreDialog() {
  return null;
}
export function BackupSettings() {
  return null;
}
