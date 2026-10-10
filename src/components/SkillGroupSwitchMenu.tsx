import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

interface MenuPos {
  top: number;
  left: number;
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
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const open = pos !== null;

  const currentGroupId = skill.skill_group_ids[0] ?? null;
  const currentGroupName = currentGroupId
    ? groupNameMap.get(currentGroupId)
    : null;

  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      if (
        panelRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      )
        return;
      setPos(null);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPos(null);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleOpen = useCallback(() => {
    if (open) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuW = 180;
    const menuH = skillGroups.length * 32 + 60;
    setPos({
      top: Math.min(rect.bottom + 4, window.innerHeight - menuH - 8),
      left: Math.min(rect.left, window.innerWidth - menuW - 8),
    });
  }, [open, skillGroups.length]);

  const handleSelect = useCallback(
    async (groupId: string) => {
      if (pending) return;
      if (groupId === currentGroupId) return;
      setPending(groupId);
      try {
        await onSwitch(skill.id, groupId);
        setPos(null);
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
      setPos(null);
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
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleOpen();
        }}
        className={cn(
          "truncate font-medium text-amber-600 transition-colors hover:text-amber-500 hover:underline dark:text-amber-400/80 dark:hover:text-amber-300",
          fontSize,
        )}
        title={t("mySkills.membership.switchGroup")}
      >
        {currentGroupName}
      </button>
      {open &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={(e) => {
                e.stopPropagation();
                setPos(null);
              }}
            />
            <div
              ref={panelRef}
              className="fixed z-50 min-w-[180px] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
              style={{ top: pos.top, left: pos.left }}
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
          </>,
          document.body,
        )}
    </>
  );
}
