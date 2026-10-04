import { invoke } from "@tauri-apps/api/core";

/** Launch only the bundled Skills manager, with no caller-supplied command. */
export function openSkillsManager(): Promise<void> {
  return invoke<void>("open_skills_manager");
}
