import { useTranslation } from "react-i18next";
import type { ManagedSkill, ProjectSkill, SkillGroup } from "../lib/tauri";
import { SkillGroupSelect } from "./SkillGroupSelect";
import { getSkillGroupDisplayName } from "../lib/skillGroupDisplay";

/** Choose the destination group for the selected project version. */
export function ProjectSkillUploadTarget({
  variant,
  managedSkills,
  skillGroups,
  selectedGroup,
  onSelectGroup,
}: {
  variant: Pick<ProjectSkill, "center_skill_id" | "name">;
  managedSkills: Pick<ManagedSkill, "id" | "name" | "skill_group_ids">[];
  skillGroups: Pick<SkillGroup, "id" | "name">[];
  selectedGroup?: string;
  onSelectGroup?: (groupId: string) => void;
}) {
  const { t } = useTranslation();
  const existing = managedSkills.find(
    (skill) => skill.id === variant.center_skill_id,
  );
  const groupId = selectedGroup ?? existing?.skill_group_ids[0] ?? "";
  const group = skillGroups.find((item) => item.id === groupId);
  const unavailable =
    (!!variant.center_skill_id && !existing) || (!!groupId && !group);
  const groupName = unavailable
    ? t("project.updateCenterTargetUnavailable")
    : group
      ? getSkillGroupDisplayName(group.name, t)
      : t("mySkills.sourceFilter.ungrouped");

  return (
    <div className="rounded-lg border border-accent/25 bg-accent/5 px-3 py-2.5">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-[12px]">
        <dt className="text-muted">{t("project.updateCenterTargetSkill")}</dt>
        <dd className="break-words font-medium text-primary">
          {existing?.name ?? variant.name}
        </dd>
        <dt className="text-muted">{t("project.updateCenterTargetGroup")}</dt>
        <dd className="break-words font-medium text-accent-light">
          {onSelectGroup ? (
            <SkillGroupSelect
              label={t("project.updateCenterTargetGroup")}
              value={groupId}
              options={[
                { id: "", label: t("mySkills.sourceFilter.ungrouped") },
                ...skillGroups.map((item) => ({
                  id: item.id,
                  label: getSkillGroupDisplayName(item.name, t),
                })),
              ]}
              onChange={onSelectGroup}
            />
          ) : (
            groupName
          )}
        </dd>
      </dl>
      {onSelectGroup ? (
        <p className="mt-2 text-[11px] leading-5 text-muted">
          {t("project.updateCenterTargetSelectedHint")}
        </p>
      ) : (
        !unavailable && (
          <p className="mt-2 text-[11px] leading-5 text-muted">
            {t(
              existing
                ? "project.updateCenterTargetExisting"
                : "project.updateCenterTargetNew",
            )}
          </p>
        )
      )}
    </div>
  );
}
