import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FolderPlus, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getErrorMessage } from "../lib/error";
import { getAppScale } from "../lib/textScale";
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
  const menuId = useId();
  const requestPending = useRef(false);

  const open = pos !== null;

  const currentGroupId = skill.skill_group_ids[0] ?? null;
  const currentGroupName = currentGroupId
    ? groupNameMap.get(currentGroupId)
    : null;
  const actionLabel = t(
    currentGroupId
      ? "mySkills.membership.switchGroup"
      : "mySkills.membership.add",
  );

  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
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
      triggerRef.current?.focus();
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
    const menuH = Math.min(skillGroups.length * 32 + 60, 280);
    const scale = getAppScale();
    setPos({
      top: Math.max(
        8,
        Math.min(
          rect.bottom / scale + 4,
          window.innerHeight / scale - menuH - 8,
        ),
      ),
      left: Math.max(
        8,
        Math.min(rect.left / scale, window.innerWidth / scale - menuW - 8),
      ),
    });
  }, [open, skillGroups.length]);

  const handleSelect = useCallback(
    async (groupId: string) => {
      if (requestPending.current) return;
      if (groupId === currentGroupId) return;
      requestPending.current = true;
      setPending(groupId);
      try {
        await onSwitch(skill.id, groupId);
        setPos(null);
        triggerRef.current?.focus();
        toast.success(
          t(
            currentGroupId
              ? "mySkills.membership.movedTo"
              : "mySkills.membership.added",
            {
              skill: skill.name,
              group:
                groupNameMap.get(groupId) ??
                skillGroups.find((group) => group.id === groupId)?.name ??
                "",
            },
          ),
        );
      } catch (error) {
        toast.error(getErrorMessage(error, t("common.error")));
      } finally {
        requestPending.current = false;
        setPending(null);
      }
    },
    [currentGroupId, groupNameMap, onSwitch, skill, skillGroups, t],
  );

  const handleRemove = useCallback(async () => {
    if (requestPending.current || !currentGroupId) return;
    requestPending.current = true;
    setPending("__remove__");
    try {
      await onRemove(skill.id, currentGroupId);
      setPos(null);
      triggerRef.current?.focus();
      toast.success(
        t("mySkills.membership.removed", {
          skill: skill.name,
          group: currentGroupName ?? "",
        }),
      );
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      requestPending.current = false;
      setPending(null);
    }
  }, [currentGroupId, currentGroupName, onRemove, skill, t]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={skillGroups.length === 0 && !currentGroupId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          handleOpen();
        }}
        className={cn(
          "inline-flex min-w-0 shrink-0 max-w-[160px] items-center gap-1 rounded px-1 py-0.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50",
          currentGroupId
            ? "text-amber-600 hover:text-amber-500 hover:underline dark:text-amber-400/80 dark:hover:text-amber-300"
            : "text-muted hover:bg-surface-hover hover:text-accent",
          fontSize,
        )}
        title={
          skillGroups.length === 0 && !currentGroupId
            ? t("mySkills.membership.chooseGroup")
            : actionLabel
        }
      >
        {!currentGroupId && (
          <FolderPlus aria-hidden="true" className="h-3 w-3 shrink-0" />
        )}
        <span className="truncate">{currentGroupName ?? actionLabel}</span>
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
              id={menuId}
              role="menu"
              aria-label={actionLabel}
              aria-busy={!!pending}
              className="fixed z-50 min-w-[180px] overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
              style={{
                top: pos.top,
                left: pos.left,
                maxHeight:
                  "min(280px, calc(100vh / var(--app-scale, 1) - 16px))",
                maxWidth: "calc(100vw / var(--app-scale, 1) - 16px)",
              }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  setPos(null);
                  triggerRef.current?.focus();
                  return;
                }
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key))
                  return;
                e.preventDefault();
                e.stopPropagation();
                const buttons = Array.from(
                  e.currentTarget.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  ),
                );
                const index = buttons.findIndex(
                  (button) => button === document.activeElement,
                );
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? buttons.length - 1
                      : (index +
                          (e.key === "ArrowDown" ? 1 : -1) +
                          buttons.length) %
                        buttons.length;
                buttons[next]?.focus();
              }}
            >
              <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-faint">
                {actionLabel}
              </div>
              {skillGroups.map((group) => {
                const isCurrent = group.id === currentGroupId;
                const isPending = pending === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    role="menuitem"
                    aria-current={isCurrent || undefined}
                    disabled={!!pending}
                    onClick={() => handleSelect(group.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40",
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
                      {groupNameMap.get(group.id) ?? group.name}
                    </span>
                  </button>
                );
              })}
              {currentGroupId && (
                <>
                  <div className="mx-1 my-0.5 border-t border-border" />
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!!pending}
                    onClick={handleRemove}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] text-danger transition-colors hover:bg-danger-bg focus-visible:outline-none focus-visible:bg-danger-bg focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
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
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
