import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import * as api from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import type { ManagedSkill, SkillGroup } from "../lib/tauri";

export interface MoveConfirmState {
  skill: ManagedSkill;
  fromGroupId: string;
  fromGroupName: string;
}

export function useSkillGroupMembershipActions({
  group,
  groupName,
  groupNameMap,
  selectedSkills,
  enabling,
  onChanged,
}: {
  group: SkillGroup | null;
  groupName: string;
  groupNameMap: Map<string, string>;
  selectedSkills: ManagedSkill[];
  enabling: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { refreshSkillGroupMembership } = useApp();
  const pendingBatch = useRef(false);
  const [batchToggling, setBatchToggling] = useState(false);
  const [moveConfirm, setMoveConfirm] = useState<MoveConfirmState | null>(null);

  const executeAdd = useCallback(
    async (skill: ManagedSkill) => {
      if (!group) return;
      try {
        await api.setSkillGroupMembership([skill.id], group.id, true);
        onChanged();
        toast.success(
          t("mySkills.membership.added", {
            skill: skill.name,
            group: groupName,
          }),
        );
      } finally {
        await refreshSkillGroupMembership(group.id);
      }
    },
    [group, groupName, onChanged, refreshSkillGroupMembership, t],
  );

  const handleToggleSkillGroup = useCallback(
    async (skill: ManagedSkill) => {
      if (!group) return;
      const add = !skill.skill_group_ids.includes(group.id);
      if (add) {
        const otherGroupId = skill.skill_group_ids.find(
          (id) => id !== group.id,
        );
        if (otherGroupId) {
          setMoveConfirm({
            skill,
            fromGroupId: otherGroupId,
            fromGroupName: groupNameMap.get(otherGroupId) ?? otherGroupId,
          });
          return;
        }
        await executeAdd(skill);
      } else {
        try {
          await api.setSkillGroupMembership([skill.id], group.id, false);
          onChanged();
          toast.success(
            t("mySkills.membership.removed", {
              skill: skill.name,
              group: groupName,
            }),
          );
        } finally {
          await refreshSkillGroupMembership(group.id);
        }
      }
    },
    [
      group,
      groupName,
      groupNameMap,
      executeAdd,
      onChanged,
      refreshSkillGroupMembership,
      t,
    ],
  );

  const confirmMove = useCallback(async () => {
    if (!moveConfirm) return;
    const { skill } = moveConfirm;
    setMoveConfirm(null);
    await executeAdd(skill);
  }, [moveConfirm, executeAdd]);

  const cancelMove = useCallback(() => setMoveConfirm(null), []);

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

  return {
    batchToggling,
    handleToggleSkillGroup,
    handleBatchToggleSkillGroup,
    moveConfirm,
    confirmMove,
    cancelMove,
  };
}
