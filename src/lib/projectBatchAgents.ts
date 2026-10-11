import type { ProjectSkill } from "./tauri";
import * as api from "./tauri";

export interface BatchProjectSkill {
  name: string;
  variants: Pick<
    ProjectSkill,
    "agent" | "agent_display_name" | "relative_path" | "enabled"
  >[];
  centerSkillIds: string[];
}

export function enabledProjectAgentNames(
  variants: BatchProjectSkill["variants"],
) {
  return [
    ...new Set(
      variants.filter((v) => v.enabled).map((v) => v.agent_display_name),
    ),
  ];
}

/** Operate only on selected agents; enabling also installs missing managed skills. */
export async function applyProjectBatchAgents(
  projectId: string,
  skills: BatchProjectSkill[],
  agentKeys: string[],
  enabled: boolean,
  requiresCenter: (agent: string) => string,
) {
  let changed = 0;
  const errors: { skillName: string; agentKey: string; error: unknown }[] = [];
  for (const skill of skills) {
    for (const agentKey of new Set(agentKeys)) {
      const variants = skill.variants.filter((v) => v.agent === agentKey);
      try {
        if (enabled && variants.length === 0) {
          const centerId = skill.centerSkillIds[0];
          if (!centerId) throw new Error(requiresCenter(agentKey));
          await api.exportSkillToProject(centerId, projectId, [agentKey]);
          changed++;
        } else {
          for (const variant of variants) {
            if (variant.enabled === enabled) continue;
            await api.toggleProjectSkill(
              projectId,
              variant.relative_path,
              agentKey,
              enabled,
            );
            changed++;
          }
        }
      } catch (error) {
        errors.push({ skillName: skill.name, agentKey, error });
      }
    }
  }
  return { changed, errors };
}
