import { invoke } from "@tauri-apps/api/core";
export type SystemPermission =
  "accessibility" | "screen_capture" | "files_folders" | "full_disk";
export interface SystemPermissions {
  platform: string;
  accessibility: boolean | null;
  screen_capture: boolean | null;
}
export const getSystemPermissions = () =>
  invoke<SystemPermissions>("get_system_permissions");
export const openSystemPermissionSettings = (permission: SystemPermission) =>
  invoke<void>("open_system_permission_settings", { permission });
