import { createSession, openPreview, type PreviewSession } from "./session";
import type { BrowserProfile } from "../api";
const KEY = "agent-hub.preview.tabs.v1";
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function loadPreviewSession(): PreviewSession {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!Array.isArray(value)) return createSession();
    return value.slice(0, 12).reduce<PreviewSession>((state, item: unknown) => {
      if (
        !record(item) ||
        typeof item.address !== "string" ||
        typeof item.title !== "string" ||
        item.profile === "guest"
      )
        return state;
      const url = new URL(item.address);
      if (
        !["http:", "https:", "about:"].includes(url.protocol) ||
        (url.protocol === "about:" && item.address !== "about:blank")
      )
        return state;
      return openPreview(state, {
        kind: "web",
        address: item.address,
        title: item.title.slice(0, 200),
        profile: typeof item.profile === "string" ? item.profile : "default",
      });
    }, createSession());
  } catch {
    return createSession();
  }
}
export function savePreviewSession(
  state: PreviewSession,
  profiles: BrowserProfile[] = [],
) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(
        state.tabs
          .filter(
            (tab) =>
              tab.kind === "web" &&
              tab.profile !== "guest" &&
              !profiles.some(
                (profile) => profile.id === tab.profile && profile.ephemeral,
              ),
          )
          .map(({ address, title, profile }) => ({ address, title, profile })),
      ),
    );
  } catch {
    /* Session restoration is optional when browser storage is unavailable. */
  }
}
