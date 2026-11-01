import { useEffect, useRef, useState, type RefObject } from "react";
import { getAppScale } from "../lib/textScale";
import { cn } from "../utils";

type Mark = { top: number; height: number; kind: string };
interface Metrics {
  top: number;
  viewport: number;
  content: number;
  track: number;
}
const empty: Metrics = { top: 0, viewport: 0, content: 0, track: 0 };

/** A document overview tied to the real scroll container, including wrapped-line geometry. */
export function ScrollOverview({
  scrollRef,
  contentKey,
  controls,
  label,
  hint,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  contentKey: string;
  controls: string;
  label: string;
  hint?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ offset: number; pointer: number } | undefined>(
    undefined,
  );
  const [metrics, setMetrics] = useState(empty);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const viewport = scrollRef.current;
    const rail = track.current;
    if (!viewport || !rail) return;
    const position = () =>
      setMetrics((previous) => {
        const next = {
          top: viewport.scrollTop,
          viewport: viewport.clientHeight,
          content: viewport.scrollHeight,
          track: rail.clientHeight,
        };
        return Object.keys(next).every(
          (key) =>
            previous[key as keyof Metrics] === next[key as keyof Metrics],
        )
          ? previous
          : next;
      });
    const measure = () => {
      position();
      const origin = viewport.getBoundingClientRect().top;
      const height = Math.max(1, viewport.scrollHeight);
      const scale = getAppScale();
      const next: Mark[] = [];
      viewport
        .querySelectorAll<HTMLElement>("[data-overview-kind]")
        .forEach((row) => {
          const rect = row.getBoundingClientRect();
          const top =
            (((rect.top - origin) / scale + viewport.scrollTop) / height) * 100;
          const size = (rect.height / scale / height) * 100;
          const kind = row.dataset.overviewKind ?? "modified";
          const previous = next.at(-1);
          if (
            previous &&
            previous.kind === kind &&
            Math.abs(previous.top + previous.height - top) < 0.15
          )
            previous.height = top + size - previous.top;
          else next.push({ top, height: size, kind });
        });
      setMarks(next);
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const factor =
        event.deltaMode === 1
          ? 20
          : event.deltaMode === 2
            ? viewport.clientHeight
            : 1;
      viewport.scrollTop += event.deltaY * factor;
      viewport.scrollLeft += event.deltaX * factor;
      event.preventDefault();
      position();
    };
    measure();
    viewport.addEventListener("scroll", position, { passive: true });
    rail.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(viewport);
    observer?.observe(rail);
    if (viewport.firstElementChild)
      observer?.observe(viewport.firstElementChild);
    return () => {
      viewport.removeEventListener("scroll", position);
      rail.removeEventListener("wheel", wheel);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [scrollRef, contentKey]);
  const range = Math.max(0, metrics.content - metrics.viewport);
  const thumbHeight = Math.min(
    metrics.track,
    Math.max(
      18,
      (metrics.track * metrics.viewport) / Math.max(1, metrics.content),
    ),
  );
  const travel = Math.max(0, metrics.track - thumbHeight);
  const thumbTop = range ? (metrics.top / range) * travel : 0;
  const scrollTo = (top: number) => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const value = Math.max(0, Math.min(range, top));
    viewport.scrollTop = value;
    setMetrics((previous) => ({ ...previous, top: value }));
  };
  const move = (clientY: number, offset: number) => {
    const rect = track.current!.getBoundingClientRect();
    const scale = rect.height / Math.max(1, metrics.track);
    const position = (clientY - rect.top - offset) / scale;
    scrollTo(travel ? (position / travel) * range : 0);
  };
  return (
    <div
      ref={track}
      role="scrollbar"
      aria-label={label}
      title={hint ?? label}
      aria-controls={controls}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={range}
      aria-valuenow={Math.min(range, Math.round(metrics.top))}
      aria-disabled={!range}
      tabIndex={range ? 0 : -1}
      className={cn("scroll-overview", dragging && "scroll-overview-dragging")}
      onPointerDown={(event) => {
        if (!range || event.button !== 0) return;
        event.preventDefault();
        const scale =
          event.currentTarget.getBoundingClientRect().height /
          Math.max(1, metrics.track);
        const onThumb =
          event.target instanceof Element &&
          !!event.target.closest("[data-overview-thumb]");
        const offset = onThumb
          ? event.clientY -
            event.currentTarget.getBoundingClientRect().top -
            thumbTop * scale
          : (thumbHeight * scale) / 2;
        drag.current = { offset, pointer: event.pointerId };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
        move(event.clientY, offset);
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointer === event.pointerId)
          move(event.clientY, drag.current.offset);
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointer !== event.pointerId) return;
        drag.current = undefined;
        setDragging(false);
        if (event.currentTarget.hasPointerCapture?.(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => {
        drag.current = undefined;
        setDragging(false);
      }}
      onKeyDown={(event) => {
        const next =
          event.key === "ArrowDown"
            ? metrics.top + 24
            : event.key === "ArrowUp"
              ? metrics.top - 24
              : event.key === "PageDown"
                ? metrics.top + metrics.viewport
                : event.key === "PageUp"
                  ? metrics.top - metrics.viewport
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? range
                      : null;
        if (next === null) return;
        event.preventDefault();
        scrollTo(next);
      }}
    >
      {range > 0 && (
        <span
          data-overview-thumb
          className="scroll-overview-thumb"
          style={{ top: thumbTop, height: thumbHeight }}
        />
      )}
      {marks.map((mark, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn("scroll-overview-mark", `scroll-overview-${mark.kind}`)}
          style={{
            top: `${Math.max(0, mark.top)}%`,
            height: `${Math.max(mark.height, 0.35)}%`,
          }}
        />
      ))}
    </div>
  );
}
