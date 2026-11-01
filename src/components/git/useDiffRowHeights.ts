import { useLayoutEffect, useState } from "react";
import type { GitDiffRow } from "../../lib/gitDiff";
import { getAppScale } from "../../lib/textScale";

/** Measure wrapped source rows together so the two versions keep matching baselines. */
export function useDiffRowHeights(
  rows: GitDiffRow[],
  wrap: boolean,
  original: HTMLElement | null,
  updated: HTMLElement | null,
) {
  const [measured, setMeasured] = useState<{
    rows: GitDiffRow[];
    heights: number[];
  }>();
  useLayoutEffect(() => {
    if (!wrap || !original || !updated) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;contain:layout style paint;";
      const samples: { element: HTMLElement; row: number }[] = [];
      const heights = rows.map(() => 0);
      for (const [side, viewport] of [
        ["left", original],
        ["right", updated],
      ] as const) {
        const gutters = viewport.querySelector<HTMLElement>(".cm-gutters");
        const width = viewport.clientWidth - (gutters?.offsetWidth ?? 0) - 24;
        if (width <= 0) return;
        const style = getComputedStyle(viewport);
        rows.forEach((row, index) => {
          const sample = document.createElement("div");
          Object.assign(sample.style, {
            width: `${width}px`,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            fontVariantLigatures: "none",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            tabSize: "4",
          });
          sample.textContent =
            (row.type === "line" ? row[side]?.content : "") || " ";
          probe.append(sample);
          samples.push({ element: sample, row: index });
        });
      }
      document.body.append(probe);
      for (const { element, row } of samples)
        heights[row] = Math.max(
          heights[row],
          element.getBoundingClientRect().height / getAppScale(),
        );
      probe.remove();
      if (!heights.every((height) => height > 0)) return;
      setMeasured((previous) =>
        previous?.rows === rows &&
        previous.heights.every((height, index) => height === heights[index])
          ? previous
          : { rows, heights },
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(original);
    observer?.observe(updated);
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [rows, wrap, original, updated]);
  return wrap && measured?.rows === rows ? measured.heights : undefined;
}
