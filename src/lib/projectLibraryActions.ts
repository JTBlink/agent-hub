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

/** A shared project Skill toggles atomically once; legacy entries remain serial. */
export async function toggleProjectSkillGroup(
  projectId: string,
  variants: ProjectSkill[],
  enabled: boolean,
  linked: boolean,
) {
  const directory = variants[0]?.relative_path;
  if (!linked && directory) {
    const status = await api.getProjectLibraryStatus(projectId);
    if (status.skills.some((skill) => skill.directory === directory)) {
      await api.setProjectLibrarySkillEnabled(projectId, directory, enabled);
      return;
    }
  }
  for (const variant of variants) {
    await api.toggleProjectSkill(
      projectId,
      variant.relative_path,
      variant.agent,
      enabled,
    );
  }
}
