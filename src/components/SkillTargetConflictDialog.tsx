import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "./ConfirmDialog";
import { getErrorMessage, type TargetConflictDetail } from "../lib/error";
import { syncSkillToTool } from "../lib/tauri";

export interface SkillTargetConflict {
  skillId: string;
  tool: string;
  displayName: string;
  conflicts: TargetConflictDetail[];
}

export function SkillTargetConflictDialog({
  conflict,
  skillName,
  onClose,
  onInstalled,
}: {
  conflict: SkillTargetConflict | null;
  skillName: string;
  onClose: () => void;
  onInstalled: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      open={!!conflict}
      title={t("targetConflict.title")}
      message={t("targetConflict.message")}
      confirmLabel={t("targetConflict.confirmAction")}
      tone="warning"
      onClose={onClose}
      onConfirm={async () => {
        if (!conflict) return false;
        try {
          await syncSkillToTool(conflict.skillId, conflict.tool, true);
          await onInstalled();
          toast.success(
            t("mySkills.targetInstalled", {
              name: skillName,
              agent: conflict.displayName,
            }),
          );
        } catch (error: unknown) {
          toast.error(getErrorMessage(error, t("common.error")));
          return false;
        }
      }}
    >
      <div className="flex flex-wrap gap-2">
        {conflict?.conflicts.map((item) => (
          <span
            key={item.path}
            className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-secondary px-2.5 py-1 text-[13px] text-secondary"
          >
            {item.path}
            {item.is_skill && (
              <span className="rounded-full bg-accent-dark/20 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                Skill
              </span>
            )}
          </span>
        ))}
      </div>
    </ConfirmDialog>
  );
}
