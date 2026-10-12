export const TEXT_SIZE_SCALE_MAP: Record<string, string> = {
  small: "0.9",
  default: "1",
  large: "1.1",
  xlarge: "1.2",
};

export function applyTextSize(size: string) {
  const scale = TEXT_SIZE_SCALE_MAP[size] || TEXT_SIZE_SCALE_MAP.default;
  document.documentElement.style.zoom = scale;
  document.documentElement.style.setProperty("--app-scale", scale);
}

/** Convert viewport coordinates for elements rendered under the app's CSS zoom. */
export function getAppScale(): number {
  const scale = Number(
    document.documentElement.style.getPropertyValue("--app-scale"),
  );
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}
