import { openUrl } from "@tauri-apps/plugin-opener";
import { getSettings } from "./tauri";
import { queuePreviewWeb } from "../features/preview/shared/openRequests";
export const LINK_DESTINATION_KEY = "preview_link_destination";
export type LinkDestination = "system" | "preview";
export function linkDestination(value: string | null): LinkDestination {
  return value === "preview" ? "preview" : "system";
}
export function invertLinkDestination(event: {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}) {
  return event.shiftKey && (event.metaKey || event.ctrlKey);
}
export function isWebLink(address: string): boolean {
  if (address.length > 8192) return false;
  try {
    return ["http:", "https:"].includes(new URL(address).protocol);
  } catch {
    return false;
  }
}
/** Content links share one preference; explicit authentication actions keep their own opener. */
export async function openWebLink(
  address: string,
  options: { invert?: boolean; profile?: string } = {},
) {
  if (!isWebLink(address)) throw new Error("Unsupported web link");
  const preferred = linkDestination(await getSettings(LINK_DESTINATION_KEY));
  const destination = options.invert
    ? preferred === "system"
      ? "preview"
      : "system"
    : preferred;
  if (destination === "preview") queuePreviewWeb(address, options.profile);
  else await openUrl(address);
}
