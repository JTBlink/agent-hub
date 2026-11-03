import { invoke } from "@tauri-apps/api/core";

export interface HostsSnapshot {
  path: string;
  content: string;
  revision: string;
  backup_warning?: string | null;
  applied_profile_id?: string | null;
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

export interface HostsProfile extends HostsSnapshot {
  id: string;
  name: string;
}
export const listHostsProfiles = () =>
  invoke<HostsProfile[]>("list_hosts_profiles");
export const createHostsProfile = (name: string, content: string) =>
  invoke<HostsProfile>("create_hosts_profile", { name, content });
export const updateHostsProfile = (
  profile: HostsProfile,
  name: string,
  content: string,
) =>
  invoke<HostsProfile>("update_hosts_profile", {
    id: profile.id,
    name,
    content,
    revision: profile.revision,
  });
export const deleteHostsProfile = (profile: HostsProfile) =>
  invoke<void>("delete_hosts_profile", {
    id: profile.id,
    revision: profile.revision,
  });
export const applyHostsProfile = (
  profile: HostsProfile,
  systemRevision: string,
) =>
  invoke<HostsSaved>("apply_hosts_profile", {
    id: profile.id,
    profileRevision: profile.revision,
    systemRevision,
  });
