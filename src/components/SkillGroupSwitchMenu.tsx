import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getErrorMessage } from "../lib/error";
import { cn } from "../utils";
import type { ManagedSkill, SkillGroup } from "../lib/tauri";

interface Props {
  skill: ManagedSkill;
  skillGroups: SkillGroup[];
  groupNameMap: Map<string, string>;
  onSwitch: (skillId: string, toGroupId: string) => Promise<void>;
  onRemove: (skillId: string, fromGroupId: string) => Promise<void>;
  fontSize?: string;
}

export function SkillGroupSwitchMenu({
  skill,
  skillGroups,
  groupNameMap,
  onSwitch,
  onRemove,
  fontSize = "text-[12px]",
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentGroupId = skill.skill_group_ids[0] ?? null;
  const currentGroupName = currentGroupId
    ? groupNameMap.get(currentGroupId)
    : null;

  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleSelect = useCallback(
    async (groupId: string) => {
      if (pending) return;
      if (groupId === currentGroupId) return;
      setPending(groupId);
      try {
        await onSwitch(skill.id, groupId);
        setOpen(false);
        toast.success(
          t("mySkills.membership.movedTo", {
            skill: skill.name,
            group: groupNameMap.get(groupId) ?? groupId,
          }),
        );
      } catch (error) {
        toast.error(getErrorMessage(error, t("common.error")));
      } finally {
        setPending(null);
      }
    },
    [currentGroupId, groupNameMap, onSwitch, pending, skill, t],
  );

  const handleRemove = useCallback(async () => {
    if (pending || !currentGroupId) return;
    setPending("__remove__");
    try {
      await onRemove(skill.id, currentGroupId);
      setOpen(false);
      toast.success(
        t("mySkills.membership.removed", {
          skill: skill.name,
          group: currentGroupName ?? "",
        }),
      );
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setPending(null);
    }
  }, [currentGroupId, currentGroupName, onRemove, pending, skill, t]);

  if (!currentGroupName) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={cn(
          "truncate font-medium text-amber-600 transition-colors hover:text-amber-500 hover:underline dark:text-amber-400/80 dark:hover:text-amber-300",
          fontSize,
        )}
        title={t("mySkills.membership.switchGroup")}
      >
        {currentGroupName}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-faint">
            {t("mySkills.membership.switchGroup")}
          </div>
          {skillGroups.map((group) => {
            const isCurrent = group.id === currentGroupId;
            const isPending = pending === group.id;
            return (
              <button
                key={group.id}
                type="button"
                disabled={!!pending}
                onClick={() => handleSelect(group.id)}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  isCurrent
                    ? "font-medium text-accent"
                    : "text-secondary hover:bg-surface-hover",
                )}
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  {isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : isCurrent ? (
                    <Check className="h-3 w-3" />
                  ) : null}
                </span>
                <span className="truncate">
                  {groupNameMap.get(group.id) ?? group.id}
                </span>
              </button>
            );
          })}
          <div className="mx-1 my-0.5 border-t border-border" />
          <button
            type="button"
            disabled={!!pending}
            onClick={handleRemove}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] text-danger transition-colors hover:bg-danger-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
              {pending === "__remove__" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
            </span>
            {t("mySkills.membership.removeFromGroup")}
          </button>
        </div>
      )}
    </div>
  );
}
