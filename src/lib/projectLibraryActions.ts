import * as api from "./tauri";
import type { ProjectSkill } from "./tauri";

/** Whole-skill deletion and single-target removal have different ownership. */
export async function deleteProjectSkillGroup(
  projectId: string,
  variants: ProjectSkill[],
  linked: boolean,
) {
  const directory = variants[0]?.relative_path;
  if (!linked && directory) {
    const status = await api.getProjectLibraryStatus(projectId);
    if (status.skills.some((skill) => skill.directory === directory)) {
      await api.removeProjectLibrarySkill(projectId, directory);
      return;
    }
  }
  for (const variant of variants) {
    await api.deleteProjectSkill(
      projectId,
      variant.relative_path,
      variant.agent,
    );
  }
}
