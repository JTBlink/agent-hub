import type { TFunction } from "i18next";
import * as api from "./tauri";
import type { ProjectSkill } from "./tauri";
import { getErrorMessage } from "./error";

/** Use the returned central ID so newly imported skills can also be grouped. */
export async function uploadProjectSkillToGroup(
  projectId: string,
  variant: Pick<ProjectSkill, "relative_path" | "agent">,
  targetGroup: string | undefined,
  t: TFunction,
): Promise<void> {
  const skillId = await api.updateProjectSkillToCenter(
    projectId,
    variant.relative_path,
    variant.agent,
  );
  if (targetGroup === undefined) return;
  try {
    if (targetGroup) {
      await api.setSkillGroupMembership([skillId], targetGroup, true);
    } else {
      const skills = await api.getManagedSkills();
      const skill = skills.find((item) => item.id === skillId);
      if (!skill) throw new Error(t("project.updateCenterTargetUnavailable"));
      for (const group of skill.skill_group_ids) {
        await api.setSkillGroupMembership([skillId], group, false);
      }
    }
  } catch (error) {
    throw new Error(
      t("project.updateCenterGroupFailed", {
        reason: getErrorMessage(error, t("common.error")),
      }),
    );
  }
}
