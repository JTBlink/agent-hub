import * as api from "./tauri";

/** Opening a folder registers it once, then enters its existing workspace. */
export async function openProjectFolder() {
  const path = await api.pickDirectory();
  if (!path) return null;
  const projects = await api.getProjects();
  const existing = projects.find((project) => project.path === path);
  if (existing) return existing;
  try {
    return await api.addProject(path);
  } catch (error) {
    // A concurrent opener may have registered the same folder during the request.
    const registered = (await api.getProjects()).find(
      (project) => project.path === path,
    );
    if (registered) return registered;
    throw error;
  }
}
