import type { BrowserPageInfo } from "../api";
import {
  closePreview,
  openPreview,
  updatePreview,
  type PreviewSession,
} from "./session";
export function reconcileInventory(
  state: PreviewSession,
  mapping: Record<string, string>,
  pages: BrowserPageInfo[],
  before: Record<string, string>,
  documents: ReadonlySet<string>,
) {
  mapping = { ...mapping };
  const found = new Set(pages.map((page) => page.id));
  for (const [tab, id] of Object.entries(before)) {
    if (found.has(id) || mapping[tab] !== id) continue;
    delete mapping[tab];
    if (!documents.has(tab)) state = closePreview(state, tab);
  }
  for (const page of pages) {
    if (Object.values(mapping).includes(page.id)) continue;
    if (page.owner) {
      if (
        state.tabs.some(
          (tab) => tab.id === page.owner && tab.profile === page.profile,
        )
      )
        mapping[page.owner] = page.id;
      continue;
    }
    if (state.tabs.length >= 12) continue;
    state = openPreview(state, {
      kind: "web",
      address: page.url,
      title: page.title || page.url,
      profile: page.profile,
    });
    const id = state.activeId!;
    state = updatePreview(state, id, { revision: page.revision });
    mapping[id] = page.id;
  }
  return { state, mapping };
}
