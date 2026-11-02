import { invoke } from "@tauri-apps/api/core";

export interface HostsSnapshot {
  path: string;
  content: string;
  revision: string;
}

export interface HostsSaved {
  snapshot: HostsSnapshot;
  backup_path: string | null;
}

export const readSystemHosts = () => invoke<HostsSnapshot>("read_system_hosts");
export const openHostsPermissionSettings = () =>
  invoke<void>("open_hosts_permission_settings");
export const saveSystemHosts = (content: string, revision: string) =>
  invoke<HostsSaved>("save_system_hosts", { content, revision });
