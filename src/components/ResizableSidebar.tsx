import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getAppScale } from "../lib/textScale";
import { cn } from "../utils";

const WIDTH_CHANGE_EVENT = "agent-hub:sidebar-width-change";

interface Props {
  storageKey: string;
  side?: "left" | "right";
  label: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  reserveWidth?: number;
  constrainToParent?: boolean;
  hidden?: boolean;
  className?: string;
  onWidthChange?: (width: number) => void;
  children: ReactNode;
  id?: string;
}

/** Shared horizontal sidebar sizing in logical pixels, including app zoom. */
export function ResizableSidebar({
  storageKey,
  side = "left",
  label,
  defaultWidth = 280,
  minWidth = 180,
  maxWidth = 600,
  reserveWidth = 320,
  constrainToParent = false,
  hidden,
  className,
  onWidthChange,
  children,
  id,
}: Props) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number; pointerId: number } | null>(
    null,
  );
  const [requested, setRequested] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      return Number.isFinite(saved) && saved > 0
        ? Math.max(minWidth, Math.min(maxWidth, saved))
        : defaultWidth;
    } catch {
      return defaultWidth;
    }
  });
  useEffect(() => {
    const syncWidth = (event: Event) => {
      if (
        event instanceof CustomEvent &&
        event.detail.storageKey === storageKey &&
        Number.isFinite(event.detail.width)
      ) {
        setRequested(event.detail.width);
      }
    };
    window.addEventListener(WIDTH_CHANGE_EVENT, syncWidth);
    return () => window.removeEventListener(WIDTH_CHANGE_EVENT, syncWidth);
  }, [storageKey]);
  const [available, setAvailable] = useState(
    () => window.innerWidth / getAppScale(),
  );
  const [dragging, setDragging] = useState(false);
  const upper = Math.max(100, Math.min(maxWidth, available - reserveWidth));
  const lower = Math.min(minWidth, upper);
  const width = Math.max(lower, Math.min(upper, requested));
  useEffect(() => {
    const measure = () => {
      const parent = constrainToParent
        ? panel.current?.parentElement?.getBoundingClientRect().width
        : undefined;
      setAvailable((parent || window.innerWidth) / getAppScale());
    };
    measure();
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (panel.current?.parentElement)
      observer?.observe(panel.current.parentElement);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [constrainToParent]);
  useEffect(() => {
    onWidthChange?.(width);
  }, [width, onWidthChange]);
  useEffect(() => {
    if (!dragging) return;
    const previousCursor = document.body.style.cursor;
    const previousSelection = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelection;
    };
  }, [dragging]);
  const update = (next: number) => {
    const bounded = Math.round(Math.max(lower, Math.min(upper, next)));
    setRequested(bounded);
    window.dispatchEvent(
      new CustomEvent(WIDTH_CHANGE_EVENT, {
        detail: { storageKey, width: bounded },
      }),
    );
    try {
      localStorage.setItem(storageKey, String(bounded));
    } catch {
      /* Resizing remains available without storage. */
    }
  };
  const stop = () => {
    drag.current = null;
    setDragging(false);
  };
  return (
    <div
      id={id}
      ref={panel}
      hidden={hidden}
      style={{ width }}
      className={cn(
        "relative min-h-0 shrink-0 flex-col",
        hidden ? "hidden" : "flex",
        className,
      )}
    >
      {children}
      <div
        role="separator"
        aria-label={t("sidebar.resize", { name: label })}
        aria-orientation="vertical"
        aria-valuemin={lower}
        aria-valuemax={upper}
        aria-valuenow={width}
        tabIndex={hidden ? -1 : 0}
        title={t("sidebar.resizeHint")}
        className={cn(
          "sidebar-resize-handle absolute inset-y-0 z-40 w-2 cursor-col-resize touch-none outline-none before:absolute before:inset-y-0 before:left-[3px] before:w-0.5 hover:before:bg-accent focus-visible:before:bg-accent",
          side === "right" ? "-left-1" : "-right-1",
          dragging && "before:bg-accent",
        )}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            width,
            pointerId: event.pointerId,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (drag.current && event.pointerId === drag.current.pointerId)
            update(
              drag.current.width +
                ((event.clientX - drag.current.x) / getAppScale()) *
                  (side === "right" ? -1 : 1),
            );
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          stop();
        }}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onDoubleClick={() => update(defaultWidth)}
        onKeyDown={(event) => {
          const next =
            event.key === "ArrowLeft"
              ? width + (event.shiftKey ? 40 : 10) * (side === "right" ? 1 : -1)
              : event.key === "ArrowRight"
                ? width +
                  (event.shiftKey ? 40 : 10) * (side === "right" ? -1 : 1)
                : event.key === "Home"
                  ? lower
                  : event.key === "End"
                    ? upper
                    : undefined;
          if (next !== undefined) {
            event.preventDefault();
            update(next);
          }
        }}
      >
        <span className="sidebar-resize-grip" aria-hidden="true" />
      </div>
    </div>
  );
}
