import { getCurrentWindow } from "@tauri-apps/api/window";
import { type EventCallback } from "@tauri-apps/api/event";

const desktop = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const workspaceWindowLabel = () =>
  desktop() ? getCurrentWindow().label : "main";

/** Keep main-window storage compatible while isolating each additional workspace. */
export function workspaceStorageKey(
  key: string,
  label = workspaceWindowLabel(),
) {
  return label === "main" ? key : `${key}:${label}`;
}

/** Native close/menu events must only reach the window they belong to. */
export function listenWorkspaceEvent<T>(
  event: string,
  callback: EventCallback<T>,
) {
  return desktop()
    ? getCurrentWindow().listen(event, callback)
    : Promise.resolve(() => {});
}
