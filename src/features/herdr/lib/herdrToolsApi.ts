import { invoke } from "@tauri-apps/api/core";

export interface HerdrInstallation {
  path: string;
  version: string;
  managed: boolean;
}
export interface HerdrUpdate {
  latest_version: string;
  has_update: boolean;
  managed: boolean;
}
export const detectHerdr = () =>
  invoke<HerdrInstallation | null>("herdr_detect");
export const installHerdr = () => invoke<HerdrInstallation>("herdr_install");
export const checkHerdrUpdate = () => invoke<HerdrUpdate>("herdr_check_update");
export const updateHerdr = () => invoke<HerdrInstallation>("herdr_update");
