export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;
export const clampZoom = (zoom: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Size the layout box so zoomed images remain fully reachable by scrolling. */
export function imageLayout(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
  zoom: number,
) {
  const fit = Math.min(
    1,
    Math.max(1, availableWidth - 32) / width,
    Math.max(1, availableHeight - 32) / height,
  );
  return {
    width: width * fit * clampZoom(zoom),
    height: height * fit * clampZoom(zoom),
  };
}
