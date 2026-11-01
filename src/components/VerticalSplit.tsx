import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { getAppScale } from "../lib/textScale";
import { cn } from "../utils";

const DEFAULT_RATIO = 0.6;

/** Two independently scrolling panels, sized in logical pixels under app zoom. */
export function VerticalSplit({
  top,
  bottom,
  bottomCollapsed = false,
  storageKey,
  label,
  hint,
}: {
  top: ReactNode;
  bottom: ReactNode;
  bottomCollapsed?: boolean;
  storageKey: string;
  label: string;
  hint: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const topId = useId();
  const drag = useRef<{ y: number; height: number; pointer: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const [height, setHeight] = useState(0);
  const [ratio, setRatio] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      return Number.isFinite(saved) && saved > 0 && saved < 1
        ? saved
        : DEFAULT_RATIO;
    } catch {
      return DEFAULT_RATIO;
    }
  });
  useEffect(() => {
    const measure = () => setHeight(host.current?.clientHeight ?? 0);
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (host.current) observer?.observe(host.current);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  useEffect(() => {
    if (!dragging) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragging]);
  const available = Math.max(1, height - 1);
  const min = Math.min(140, available * 0.6);
  const max = available - Math.min(100, available * 0.4);
  const topHeight = Math.max(min, Math.min(max, available * ratio));
  const effectiveRatio = height ? topHeight / available : ratio;
  const update = (next: number) => {
    const bounded = Math.max(min, Math.min(max, next)) / available;
    setRatio(bounded);
    try {
      localStorage.setItem(storageKey, String(bounded));
    } catch {
      /* Resizing remains available when storage is disabled. */
    }
  };
  const stop = () => {
    drag.current = null;
    setDragging(false);
  };
  return (
    <div
      ref={host}
      className="grid min-h-0 min-w-0 flex-1 overflow-hidden"
      style={{
        gridTemplateRows: bottomCollapsed
          ? "minmax(0, 1fr) 1px auto"
          : `minmax(0, ${effectiveRatio}fr) 1px minmax(0, ${1 - effectiveRatio}fr)`,
      }}
    >
      <div id={topId} className="min-h-0 min-w-0 overflow-auto">
        {top}
      </div>
      <div className="relative z-10 bg-border-subtle">
        <div
          role="separator"
          aria-label={label}
          aria-controls={topId}
          aria-orientation="horizontal"
          aria-valuemin={Math.round((min / available) * 100)}
          aria-valuemax={Math.round((max / available) * 100)}
          aria-valuenow={Math.round(effectiveRatio * 100)}
          aria-disabled={bottomCollapsed}
          tabIndex={bottomCollapsed ? -1 : 0}
          title={hint}
          className={cn(
            "absolute inset-x-0 -top-1 h-2 touch-none outline-none before:absolute before:inset-x-0 before:top-[3px] before:h-0.5",
            !bottomCollapsed &&
              "cursor-row-resize hover:before:bg-accent focus-visible:before:bg-accent",
            dragging && "before:bg-accent",
          )}
          onPointerDown={(event) => {
            if (bottomCollapsed || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              y: event.clientY,
              height: topHeight,
              pointer: event.pointerId,
            };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            if (drag.current?.pointer === event.pointerId)
              update(
                drag.current.height +
                  (event.clientY - drag.current.y) / getAppScale(),
              );
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            stop();
          }}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
          onDoubleClick={() => {
            if (!bottomCollapsed) update(available * DEFAULT_RATIO);
          }}
          onKeyDown={(event) => {
            if (bottomCollapsed) return;
            const step = event.shiftKey ? 40 : 10;
            const next =
              event.key === "ArrowUp"
                ? topHeight - step
                : event.key === "ArrowDown"
                  ? topHeight + step
                  : event.key === "Home"
                    ? min
                    : event.key === "End"
                      ? max
                      : undefined;
            if (next !== undefined) {
              event.preventDefault();
              update(next);
            }
          }}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {bottom}
      </div>
    </div>
  );
}
