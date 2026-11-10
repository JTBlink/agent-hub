import * as api from "./tauri";

/** Resolve canonical directory identity without scanning skills across all projects. */
export async function openProjectFolder() {
  const path = await api.pickDirectory();
  return path ? api.resolveWorkspaceProject(path) : null;
}
