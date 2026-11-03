import type { PreviewDocument } from "../api";
export const PREVIEW_OPEN_EVENT = "agent-hub:open-preview";
const pending = new Map<string, PreviewDocument>();
const listeners = new Set<(document: PreviewDocument) => void>();
export function queuePreviewDocument(document: PreviewDocument) {
  if (listeners.size) {
    for (const listener of listeners) listener(document);
  } else pending.set(document.id, document);
  window.dispatchEvent(new Event(PREVIEW_OPEN_EVENT));
}
export function consumePreviewRequests(
  listener: (document: PreviewDocument) => void,
) {
  listeners.add(listener);
  for (const document of pending.values()) listener(document);
  pending.clear();
  return () => {
    listeners.delete(listener);
  };
}
