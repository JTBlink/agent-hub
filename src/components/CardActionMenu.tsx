import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "../utils";
import { getAppScale } from "../lib/textScale";

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
  const menuId = useId();

  const open = pos !== null;

  useEffect(() => {
    openChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const setOpenState = useCallback((next: MenuPos | null) => {
    setPos(next);
    openChangeRef.current?.(next !== null);
  }, []);

  const locate = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = getAppScale();
    const menuH =
      (panelRef.current?.getBoundingClientRect().height ?? 0) / scale ||
      actions.length * 32 + 8;
    setOpenState({
      top: Math.max(
        8,
        Math.min(
          rect.bottom / scale + 4,
          window.innerHeight / scale - menuH - 8,
        ),
      ),
      right: Math.max((window.innerWidth - rect.right) / scale, 8),
    });
  }, [actions.length, setOpenState]);

  useEffect(() => {
    if (!open) return;
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(locate);
    if (panelRef.current) observer?.observe(panelRef.current);
    panelRef.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
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
      e.preventDefault();
      e.stopPropagation();
      setOpenState(null);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    return () => {
      observer?.disconnect();
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
    };
  }, [open, locate, setOpenState]);

  useEffect(() => () => openChangeRef.current?.(false), []);

  const handleToggle = useCallback(() => {
    if (open) {
      setOpenState(null);
      return;
    }
    locate();
  }, [open, locate, setOpenState]);

  if (actions.length === 0) return null;

  return (
    <>
      <div className={cn("shrink-0", className)}>
        <button
          ref={triggerRef}
          type="button"
          title={label}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) locate();
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-md text-muted outline-none transition-colors hover:bg-surface-hover hover:text-secondary focus-visible:ring-2 focus-visible:ring-accent",
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
              id={menuId}
              role="menu"
              aria-label={label}
              className="fixed z-50 min-w-[156px] max-w-[calc(100vw/var(--app-scale)-16px)] max-h-[calc(100vh/var(--app-scale)-16px)] overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
              style={{ top: pos.top, right: pos.right }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Tab") {
                  setOpenState(null);
                  triggerRef.current?.focus();
                  return;
                }
                const items = [
                  ...(panelRef.current?.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  ) ?? []),
                ];
                const index = items.findIndex(
                  (item) => item === document.activeElement,
                );
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : event.key === "ArrowDown"
                        ? (index + 1) % items.length
                        : event.key === "ArrowUp"
                          ? (index - 1 + items.length) % items.length
                          : null;
                if (next === null) return;
                event.preventDefault();
                items[next]?.focus();
              }}
            >
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  role="menuitem"
                  disabled={action.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenState(null);
                    triggerRef.current?.focus();
                    action.onSelect();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40",
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
