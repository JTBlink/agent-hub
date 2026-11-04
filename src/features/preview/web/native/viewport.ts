import type { NativeBounds } from "./api";
/** Fit a CSS viewport into the owned native surface without covering workbench controls. */
export function nativeViewportBounds(
  rect: Pick<DOMRect, "x" | "y" | "width" | "height">,
  viewport?: { width: number; height: number } | null,
): NativeBounds {
  const base = {
    x: Math.max(0, rect.x),
    y: Math.max(0, rect.y),
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
  };
  if (
    !viewport ||
    ![viewport.width, viewport.height].every(
      (value) => Number.isFinite(value) && value >= 1 && value <= 20000,
    )
  )
    return base;
  const zoom = Math.min(
    1,
    base.width / viewport.width,
    base.height / viewport.height,
  );
  const width = viewport.width * zoom,
    height = viewport.height * zoom;
  return {
    x: base.x + (base.width - width) / 2,
    y: base.y + (base.height - height) / 2,
    width,
    height,
    zoom,
  };
}
