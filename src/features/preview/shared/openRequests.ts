import type { PreviewDocument } from "../api";
export const PREVIEW_OPEN_EVENT = "agent-hub:open-preview";
export type PreviewOpenRequest =
  | { kind: "document"; document: PreviewDocument }
  | { kind: "web"; address: string; profile: string };
const pending = new Map<string, PreviewOpenRequest>();
const listeners = new Set<(request: PreviewOpenRequest) => void>();
function enqueue(key: string, request: PreviewOpenRequest) {
  if (listeners.size) {
    for (const listener of listeners) listener(request);
  } else {
    pending.set(key, request);
    if (pending.size > 12) pending.delete(pending.keys().next().value!);
  }
  window.dispatchEvent(new Event(PREVIEW_OPEN_EVENT));
}
export function queuePreviewDocument(document: PreviewDocument) {
  enqueue(document.id, { kind: "document", document });
}
export function queuePreviewWeb(address: string, profile = "default") {
  enqueue(crypto.randomUUID(), { kind: "web", address, profile });
}
export function consumePreviewRequests(
  listener: (request: PreviewOpenRequest) => void,
) {
  listeners.add(listener);
  for (const request of pending.values()) listener(request);
  pending.clear();
  return () => {
    listeners.delete(listener);
  };
}
