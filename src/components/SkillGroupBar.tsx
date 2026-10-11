import {
  getSkillGroupDisplayName,
  getSkillGroupDisplayDescription,
} from "../lib/skillGroupDisplay";
import { useCallback, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../utils";
import {
  computeSkillGroupStatus,
  type SkillGroupStatusMode,
} from "../lib/skillGroupStatus";
import { getSkillGroupIconOption } from "../lib/skillGroupIcons";
import type { ManagedSkill, SkillGroup } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import {
  summarizeSkillGroupErrors,
  type SkillGroupOperationError,
  type SkillGroupErrorNotice,
} from "../lib/skillGroupErrors";
import { SkillGroupErrorsDialog } from "./SkillGroupErrorsDialog";

export interface SkillGroupBarProps {
  skillGroups: SkillGroup[];
  managedSkills: ManagedSkill[];
  agentKeys: string[];
  existsInWorkspace: (skill: ManagedSkill, agentKey: string) => boolean;
  onAddSkill: (skill: ManagedSkill, agentKey: string) => Promise<void>;
  onRemoveSkill: (skill: ManagedSkill, agentKey: string) => Promise<void>;
  onComplete: () => Promise<void>;
  /** Whether the status badge counts agent copies or logical skills. */
  statusMode?: SkillGroupStatusMode;
}

export function SkillGroupBar({
  skillGroups,
  managedSkills,
  agentKeys,
  existsInWorkspace,
  onAddSkill,
  onRemoveSkill,
  onComplete,
  statusMode = "agent-pair",
}: SkillGroupBarProps) {
  const { t } = useTranslation();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const [errorNotices, setErrorNotices] = useState<SkillGroupErrorNotice[]>([]);
  const reportErrors = useCallback(
    (errors: SkillGroupOperationError[]) => {
      const notices = summarizeSkillGroupErrors(errors, t("common.error"));
      setErrorNotices(notices);
      for (const notice of notices) {
        const message = t(
          notice.kind === "conflict"
            ? "skillGroupActions.partialSkippedToast"
            : "skillGroupActions.partialFailedToast",
          { count: notice.count },
        );
        const options = {
          description: notice.items
            .map((item) => `${item.skillName} · ${item.agentKey}`)
            .join("、"),
          action: {
            label: t("skillGroupActions.operationDetails"),
            onClick: () => setErrorNotices(notices),
          },
        };
        if (notice.kind === "conflict") toast.warning(message, options);
        else toast.error(message, options);
      }
    },
    [t],
  );

  const statuses = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeSkillGroupStatus>>();
    for (const skillGroup of skillGroups) {
      map.set(
        skillGroup.id,
        computeSkillGroupStatus(
          skillGroup,
          managedSkills,
          agentKeys,
          existsInWorkspace,
          statusMode,
        ),
      );
    }
    return map;
  }, [skillGroups, managedSkills, agentKeys, existsInWorkspace, statusMode]);

  const visibleSkillGroups = useMemo(
    () => skillGroups.filter((p) => statuses.get(p.id)?.status !== "empty"),
    [skillGroups, statuses],
  );

  const handleActivate = useCallback(
    async (skillGroup: SkillGroup) => {
      setLoadingKey(`${skillGroup.id}-add`);
      try {
        const skillGroupSkills = managedSkills.filter((s) =>
          s.skill_group_ids.includes(skillGroup.id),
        );
        let added = 0,
          skipped = 0;
        const failures: SkillGroupOperationError[] = [];
        for (const skill of skillGroupSkills) {
          for (const agentKey of agentKeys) {
            if (existsInWorkspace(skill, agentKey)) {
              skipped++;
              continue;
            }
            try {
              await onAddSkill(skill, agentKey);
              added++;
            } catch (e) {
              failures.push({ skillName: skill.name, agentKey, error: e });
            }
          }
        }
        if (added > 0) {
          toast.success(t("skillGroupActions.addedToast", { added, skipped }));
        } else if (failures.length === 0) {
          toast.info(t("skillGroupActions.nothingToAdd"));
        }
        reportErrors(failures);
        await onComplete();
      } catch (error) {
        toast.error(getErrorMessage(error, t("common.error")));
      } finally {
        setLoadingKey(null);
      }
    },
    [
      agentKeys,
      existsInWorkspace,
      managedSkills,
      onAddSkill,
      onComplete,
      reportErrors,
      t,
    ],
  );

  const handleDeactivate = useCallback(
    async (skillGroup: SkillGroup) => {
      setLoadingKey(`${skillGroup.id}-remove`);
      try {
        const skillGroupSkills = managedSkills.filter((s) =>
          s.skill_group_ids.includes(skillGroup.id),
        );
        let removed = 0;
        const failures: SkillGroupOperationError[] = [];
        for (const skill of skillGroupSkills) {
          for (const agentKey of agentKeys) {
            if (!existsInWorkspace(skill, agentKey)) continue;
            try {
              await onRemoveSkill(skill, agentKey);
              removed++;
            } catch (e) {
              failures.push({ skillName: skill.name, agentKey, error: e });
            }
          }
        }
        if (removed > 0) {
          toast.success(t("skillGroupActions.removedToast", { removed }));
        } else if (failures.length === 0) {
          toast.info(t("skillGroupActions.nothingToRemove"));
        }
        reportErrors(failures);
        await onComplete();
      } catch (error) {
        toast.error(getErrorMessage(error, t("common.error")));
      } finally {
        setLoadingKey(null);
      }
    },
    [
      agentKeys,
      existsInWorkspace,
      managedSkills,
      onComplete,
      onRemoveSkill,
      reportErrors,
      t,
    ],
  );

  if (visibleSkillGroups.length === 0 && errorNotices.length === 0) return null;

  const busy = loadingKey !== null;

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="shrink-0 text-[12px] text-muted">
          {t("sidebar.skillGroups")}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {visibleSkillGroups.map((skillGroup) => {
            const s = statuses.get(skillGroup.id)!;
            const skillGroupIcon = getSkillGroupIconOption(skillGroup);
            const Icon = skillGroupIcon.icon;
            const isLoading = loadingKey?.startsWith(skillGroup.id) ?? false;

            return (
              <button
                key={skillGroup.id}
                onClick={() => {
                  if (busy) return;
                  if (s.status === "active") handleDeactivate(skillGroup);
                  else handleActivate(skillGroup);
                }}
                disabled={busy}
                title={
                  getSkillGroupDisplayDescription(skillGroup, t)
                    ? `${getSkillGroupDisplayName(skillGroup.name, t)} — ${getSkillGroupDisplayDescription(skillGroup, t)}`
                    : getSkillGroupDisplayName(skillGroup.name, t)
                }
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors disabled:opacity-50",
                  s.status === "active"
                    ? `${skillGroupIcon.activeClass} ${skillGroupIcon.colorClass}`
                    : s.status === "partial"
                      ? "border-amber-400/50 bg-amber-500/8 text-amber-600 dark:text-amber-400 hover:bg-amber-500/12"
                      : "border-border-subtle text-faint hover:border-border hover:text-muted",
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
                <span className="max-w-[140px] truncate">
                  {getSkillGroupDisplayName(skillGroup.name, t)}
                </span>
                {s.status === "active" && (
                  <Check className="h-3 w-3 shrink-0" />
                )}
                {s.status === "partial" && (
                  <span className="rounded-full bg-amber-500/20 px-1.5 py-px text-[10px] font-semibold">
                    {s.installed}/{s.total}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <SkillGroupErrorsDialog
        notices={errorNotices}
        onClose={() => setErrorNotices([])}
      />
    </>
  );
}
