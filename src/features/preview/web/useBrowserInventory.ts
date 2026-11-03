import { isNativePage } from "./native/identity";
import { useEffect, useEffectEvent } from "react";
import { previewApi, type BrowserPageInfo } from "../api";
import type { PreviewModel } from "../usePreviewWorkspace";
import { reconcileInventory } from "../shared/inventory";
/** Reconcile browser-created popups and Agent-created pages into the same tab inventory. */
export function useBrowserInventory(active: boolean, model: PreviewModel) {
  const consume = useEffectEvent(
    (pages: BrowserPageInfo[], before: Record<string, string>) => {
      const { state, mapping } = reconcileInventory(
        model.sessionRef.current,
        model.pageIdsRef.current,
        pages,
        before,
        new Set(Object.keys(model.documents)),
      );
      if (state !== model.sessionRef.current) model.setSession(state);
      if (JSON.stringify(mapping) !== JSON.stringify(model.pageIdsRef.current))
        model.setPageIds(mapping);
    },
  );
  const snapshot = useEffectEvent(() =>
    Object.fromEntries(
      Object.entries(model.pageIdsRef.current).filter(
        ([, id]) => !isNativePage(id),
      ),
    ),
  );
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let timer: number | undefined;
    const poll = async () => {
      const before = snapshot();
      try {
        if (!document.hidden) {
          const pages = await previewApi.list();
          if (!disposed) consume(pages, before);
        }
      } catch {
        /* Keep the last inventory when the runtime cannot be verified. */
      } finally {
        if (!disposed) timer = window.setTimeout(() => void poll(), 1500);
      }
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [active]);
}
