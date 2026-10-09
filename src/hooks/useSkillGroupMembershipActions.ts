import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import * as api from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import type { ManagedSkill, SkillGroup } from "../lib/tauri";

export function useSkillGroupMembershipActions({
  group,
  groupName,
  selectedSkills,
  enabling,
  onChanged,
}: {
  group: SkillGroup | null;
  groupName: string;
  selectedSkills: ManagedSkill[];
  enabling: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { refreshSkillGroupMembership } = useApp();
  const pendingBatch = useRef(false);
  const [batchToggling, setBatchToggling] = useState(false);

  const handleToggleSkillGroup = async (skill: ManagedSkill) => {
    if (!group) return;
    const add = !skill.skill_group_ids.includes(group.id);
    try {
      await api.setSkillGroupMembership([skill.id], group.id, add);
      onChanged();
      toast.success(
        t(add ? "mySkills.membership.added" : "mySkills.membership.removed", {
          skill: skill.name,
          group: groupName,
        }),
      );
    } finally {
      // A metadata error can follow a DB commit; reconcile even on failure.
      await refreshSkillGroupMembership(group.id);
    }
  };

  const handleBatchToggleSkillGroup = async () => {
    if (!group || pendingBatch.current || selectedSkills.length === 0) return;
    pendingBatch.current = true;
    setBatchToggling(true);
    try {
      await api.setSkillGroupMembership(
        selectedSkills.map((skill) => skill.id),
        group.id,
        enabling,
      );
      onChanged();
      toast.success(
        t(enabling ? "mySkills.batchEnabled" : "mySkills.batchDisabled", {
          count: selectedSkills.length,
          group: groupName,
        }),
      );
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      try {
        await refreshSkillGroupMembership(group.id);
      } catch (error) {
        toast.error(getErrorMessage(error, t("common.error")));
      }
      pendingBatch.current = false;
      setBatchToggling(false);
    }
  };

  return { batchToggling, handleToggleSkillGroup, handleBatchToggleSkillGroup };
}
