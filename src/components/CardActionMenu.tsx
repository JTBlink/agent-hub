import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "../utils";
import { getAppScale } from "../lib/textScale";

export interface CardAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  keepOpen?: boolean;
  separatorBefore?: boolean;
}

interface Props {
  contextTarget?: RefObject<HTMLElement | null>;
  contextOnly?: boolean;
  shouldOpenContextMenu?: () => boolean;
  actions: CardAction[];
  label: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  triggerIcon?: React.ReactNode;
  triggerClassName?: string;
  disabled?: boolean;
  align?: "start" | "end";
  renderContent?: (close: () => void) => React.ReactNode;
}

interface MenuPos {
  top: number;
  right: number;
}

export function CardActionMenu({
  contextTarget,
  contextOnly = false,
  shouldOpenContextMenu,
  actions,
  label,
  className,
  onOpenChange,
  triggerIcon,
  triggerClassName,
  disabled,
  align = "end",
  renderContent,
}: Props) {
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openChangeRef = useRef(onOpenChange);
  const wasOpen = useRef(false);
  const contextPoint = useRef<{ x: number; y: number } | null>(null);
  const contextOrigin = useRef<HTMLElement | null>(null);
  const restoreFocus = useCallback(() => {
    (contextOrigin.current ?? triggerRef.current)?.focus();
  }, []);
  const menuId = useId();

  const open = pos !== null;
  const initialFocus = renderContent
    ? "input:not(:disabled), button:not(:disabled)"
    : "button:not(:disabled)";

  useEffect(() => {
    openChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const setOpenState = useCallback((next: MenuPos | null) => {
    setPos(next);
  }, []);
  useEffect(() => {
    openChangeRef.current?.(open);
  }, [open]);

  const locate = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect && !contextPoint.current) return;
    const scale = getAppScale();
    const menuH =
      (panelRef.current?.getBoundingClientRect().height ?? 0) / scale ||
      actions.length * 32 + 8;
    const menuW = Math.min(
      (panelRef.current?.getBoundingClientRect().width ?? 0) / scale || 156,
      window.innerWidth / scale - 16,
    );
    if (contextPoint.current) {
      setOpenState({
        top: Math.max(
          8,
          Math.min(
            contextPoint.current.y / scale,
            window.innerHeight / scale - menuH - 8,
          ),
        ),
        right: Math.max(
          8,
          Math.min(
            window.innerWidth / scale - contextPoint.current.x / scale - menuW,
            window.innerWidth / scale - menuW - 8,
          ),
        ),
      });
      return;
    }
    if (!rect) return;
    setOpenState({
      top: Math.max(
        8,
        Math.min(
          rect.bottom / scale + 4 + menuH <= window.innerHeight / scale - 8
            ? rect.bottom / scale + 4
            : rect.top / scale - menuH - 4,
          window.innerHeight / scale - menuH - 8,
        ),
      ),
      right: Math.max(
        8,
        Math.min(
          align === "start"
            ? (window.innerWidth - rect.left) / scale - menuW
            : (window.innerWidth - rect.right) / scale,
          window.innerWidth / scale - menuW - 8,
        ),
      ),
    });
  }, [actions.length, align, setOpenState]);

  useEffect(() => {
    const target = contextTarget?.current;
    if (!target || disabled) return;
    const show = (x: number, y: number) => {
      contextPoint.current = { x, y };
      contextOrigin.current = target.matches("button, [tabindex]")
        ? target
        : (target.querySelector<HTMLElement>("button, [tabindex]") ?? target);
      locate();
    };
    const onContext = (event: MouseEvent) => {
      if (shouldOpenContextMenu && !shouldOpenContextMenu()) return;
      event.preventDefault();
      event.stopPropagation();
      show(event.clientX, event.clientY);
    };
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key !== "ContextMenu" &&
        !(event.shiftKey && event.key === "F10")
      )
        return;
      if (shouldOpenContextMenu && !shouldOpenContextMenu()) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = target.getBoundingClientRect();
      show(rect.left, rect.bottom);
    };
    target.addEventListener("contextmenu", onContext);
    target.addEventListener("keydown", onKey);
    return () => {
      target.removeEventListener("contextmenu", onContext);
      target.removeEventListener("keydown", onKey);
    };
  }, [contextTarget, disabled, locate, shouldOpenContextMenu]);

  const attachPanel = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;
      if (node) locate();
    },
    [locate],
  );

  useEffect(() => {
    if (!open) return;
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(locate);
    if (panelRef.current) observer?.observe(panelRef.current);
    panelRef.current?.querySelector<HTMLElement>(initialFocus)?.focus();
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
      restoreFocus();
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
  }, [open, locate, setOpenState, restoreFocus, initialFocus]);

  useEffect(() => () => openChangeRef.current?.(false), []);
  useEffect(() => {
    if (wasOpen.current && !open && document.activeElement === document.body)
      restoreFocus();
    wasOpen.current = open;
  }, [open, restoreFocus]);

  useEffect(() => {
    if (open && !renderContent)
      panelRef.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
  }, [open, renderContent]);

  const handleToggle = useCallback(() => {
    if (open) {
      setOpenState(null);
      return;
    }
    contextPoint.current = null;
    contextOrigin.current = null;
    locate();
  }, [open, locate, setOpenState]);

  if (actions.length === 0 && !renderContent) return null;

  return (
    <>
      {!contextOnly && (
        <div className={cn("shrink-0", className)}>
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            title={label}
            aria-label={label}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (!open) {
                  contextPoint.current = null;
                  contextOrigin.current = null;
                  locate();
                }
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-md text-muted outline-none transition-colors hover:bg-surface-hover hover:text-secondary focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40",
              triggerClassName,
              open && "bg-surface-hover text-secondary",
            )}
          >
            {triggerIcon ?? <MoreHorizontal className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
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
              ref={attachPanel}
              id={menuId}
              role={renderContent ? "dialog" : "menu"}
              aria-label={label}
              className="fixed z-50 min-w-[156px] max-w-[calc(100vw/var(--app-scale)-16px)] max-h-[calc(100vh/var(--app-scale)-16px)] overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
              style={{ top: pos.top, right: pos.right }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpenState(null);
                  restoreFocus();
                  return;
                }
                if (renderContent) return;
                event.stopPropagation();
                if (event.key === "Tab") {
                  setOpenState(null);
                  restoreFocus();
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
              {renderContent
                ? renderContent(() => setOpenState(null))
                : actions.map((action) => (
                    <Fragment key={action.key}>
                      {action.separatorBefore && (
                        <div
                          role="separator"
                          className="my-1 border-t border-border-subtle"
                        />
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        disabled={action.disabled}
                        title={action.label}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!action.keepOpen) {
                            setOpenState(null);
                            restoreFocus();
                          }
                          action.onSelect();
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40",
                          action.danger
                            ? "text-danger hover:bg-danger-bg"
                            : "text-secondary hover:bg-surface-hover",
                        )}
                      >
                        {action.icon && (
                          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center opacity-70">
                            {action.icon}
                          </span>
                        )}
                        <span className="min-w-0 truncate">{action.label}</span>
                      </button>
                    </Fragment>
                  ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
