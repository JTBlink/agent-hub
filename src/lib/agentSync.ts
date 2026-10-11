import type { ToolInfo } from "./tauri";

/** Source agents can cross categories; only deployed skills missing here are added. */
export function getAgentSyncSources<
  T extends { id: string; targets: { tool: string }[] },
>(
  currentAgentKey: string,
  tools: Pick<ToolInfo, "key" | "display_name" | "installed" | "enabled">[],
  managedSkills: T[],
) {
  const currentSkillIds = new Set(
    managedSkills
      .filter((skill) =>
        skill.targets.some((target) => target.tool === currentAgentKey),
      )
      .map((skill) => skill.id),
  );
  return tools
    .filter(
      (tool) => tool.installed && tool.enabled && tool.key !== currentAgentKey,
    )
    .map((tool) => {
      const sourceSkills = managedSkills.filter((skill) =>
        skill.targets.some((target) => target.tool === tool.key),
      );
      const missingSkills = sourceSkills.filter(
        (skill) => !currentSkillIds.has(skill.id),
      );
      return {
        key: tool.key,
        displayName: tool.display_name,
        total: sourceSkills.length,
        missingCount: missingSkills.length,
        missingSkills,
      };
    });
}
