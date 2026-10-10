import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "../utils";

export interface CardAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface Props {
  actions: CardAction[];
  label: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

interface MenuPos {
  top: number;
  right: number;
}

export function CardActionMenu({
  actions,
  label,
  className,
  onOpenChange,
}: Props) {
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openChangeRef = useRef(onOpenChange);

  const open = pos !== null;

  useEffect(() => {
    openChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const setOpenState = useCallback(
    (next: MenuPos | null) => {
      setPos(next);
      openChangeRef.current?.(next !== null);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      if (
        panelRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      )
        return;
      setOpenState(null);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpenState(null);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, setOpenState]);

  useEffect(() => () => openChangeRef.current?.(false), []);

  const handleToggle = useCallback(() => {
    if (open) {
      setOpenState(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuH = actions.length * 32 + 8;
    setOpenState({
      top: Math.min(rect.bottom + 4, window.innerHeight - menuH - 8),
      right: Math.max(window.innerWidth - rect.right, 8),
    });
  }, [open, actions.length, setOpenState]);

  if (actions.length === 0) return null;

  return (
    <>
      <div className={cn("shrink-0", className)}>
        <button
          ref={triggerRef}
          type="button"
          title={label}
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-md text-muted outline-none transition-colors hover:bg-surface-hover hover:text-secondary",
            open && "bg-surface-hover text-secondary",
          )}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
      {open &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={(e) => {
                e.stopPropagation();
                setOpenState(null);
              }}
            />
            <div
              ref={panelRef}
              className="fixed z-50 min-w-[156px] rounded-lg border border-border bg-surface p-1 shadow-lg"
              style={{ top: pos.top, right: pos.right }}
              onClick={(e) => e.stopPropagation()}
            >
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  disabled={action.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenState(null);
                    action.onSelect();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    action.danger
                      ? "text-danger hover:bg-danger-bg"
                      : "text-secondary hover:bg-surface-hover",
                  )}
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center opacity-70">
                    {action.icon}
                  </span>
                  {action.label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
