import { useEffect, useLayoutEffect, useRef, useState } from "react";

// CSS pixels scale with the application's zoom. Keep geometry shared with the SVG.
export const GRAPH_ROW_HEIGHT = 30;
const OVERSCAN = 8;

/** Window rows without changing the topology computed for the complete history. */
export function useGitGraphViewport(
  count: number,
  leadingRows: number,
  resetKey = "",
) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ resetKey, top: 0, height: 600 });
  if (viewport.resetKey !== resetKey)
    setViewport({ resetKey, top: 0, height: viewport.height });
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [resetKey]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () =>
      setViewport((previous) => ({
        ...previous,
        top: element.scrollTop,
        height: element.clientHeight || 600,
      }));
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(element);
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer?.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, []);
  const offset = (leadingRows + 1) * GRAPH_ROW_HEIGHT;
  const start = Math.min(
    Math.max(0, count - 1),
    Math.max(
      0,
      Math.floor((viewport.top - offset) / GRAPH_ROW_HEIGHT) - OVERSCAN,
    ),
  );
  const end = Math.min(
    count,
    Math.max(
      start + 1,
      Math.ceil((viewport.top + viewport.height - offset) / GRAPH_ROW_HEIGHT) +
        OVERSCAN,
    ),
  );
  const reveal = (index: number) => {
    const element = ref.current;
    if (!element) return;
    const top = offset + index * GRAPH_ROW_HEIGHT;
    // Leave room for the sticky header when bringing a row into view.
    const next =
      top < viewport.top + GRAPH_ROW_HEIGHT
        ? top - GRAPH_ROW_HEIGHT
        : top + GRAPH_ROW_HEIGHT > viewport.top + viewport.height
          ? top + GRAPH_ROW_HEIGHT - viewport.height
          : viewport.top;
    element.scrollTop = next;
    setViewport({ ...viewport, top: next });
  };
  return { ref, start, end, reveal };
}
