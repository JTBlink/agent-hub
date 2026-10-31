import { useCallback, useEffect, useSyncExternalStore } from "react";
import { onAutomationChanged } from "../lib/tauri";
import { automationOverviewCache as cache } from "../lib/automationOverviewCache";

export function useAutomationOverview(locale: string) {
  const subscribe = useCallback(
    (listener: () => void) => cache.subscribe(locale, listener),
    [locale],
  );
  const getSnapshot = useCallback(() => cache.getSnapshot(locale), [locale]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    // Show the session snapshot immediately, then revalidate in the background
    // to catch changes made while this page was not observing filesystem events.
    void cache.load(locale);
  }, [locale]);
  const reload = useCallback(
    (background: boolean) => {
      void cache.load(locale, true, background);
    },
    [locale],
  );
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let unlisten: (() => void) | undefined;
    const invalidate = () => {
      if (document.visibilityState === "hidden") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => reload(true), 200);
    };
    void onAutomationChanged(invalidate)
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch(() => {
        /* Focus and manual refresh remain available. */
      });
    window.addEventListener("focus", invalidate);
    document.addEventListener("visibilitychange", invalidate);
    return () => {
      active = false;
      window.clearTimeout(timer);
      unlisten?.();
      window.removeEventListener("focus", invalidate);
      document.removeEventListener("visibilitychange", invalidate);
    };
  }, [reload]);
  const refresh = useCallback(() => reload(false), [reload]);
  return { ...snapshot, refresh };
}
