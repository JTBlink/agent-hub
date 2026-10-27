import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAutomationOverview,
  onAutomationChanged,
  type AutomationOverview,
} from "../lib/tauri";
import { getErrorMessage } from "../lib/error";

export function useAutomationOverview(locale: string) {
  const [data, setData] = useState<AutomationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [settledLocale, setSettledLocale] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const request = useRef<{
    locale: string;
    promise: Promise<AutomationOverview>;
  } | null>(null);
  useEffect(() => {
    let active = true;
    // Reuse the initial read during StrictMode's effect replay.
    if (!request.current || request.current.locale !== locale)
      request.current = { locale, promise: getAutomationOverview(locale) };
    void request.current.promise
      .then((value) => {
        if (active) {
          setData((previous) =>
            JSON.stringify(previous) === JSON.stringify(value)
              ? previous
              : value,
          );
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(getErrorMessage(cause, ""));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setSettledLocale(locale);
        }
      });
    return () => {
      active = false;
    };
  }, [attempt, locale]);
  const busy = loading || settledLocale !== locale;
  const reload = useCallback((background: boolean) => {
    request.current = null;
    if (!background) setLoading(true);
    setError(null);
    setAttempt((value) => value + 1);
  }, []);
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let unlisten: (() => void) | undefined;
    const invalidate = () => {
      if (document.visibilityState === "hidden") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setGeneration((value) => value + 1);
        reload(true);
      }, 200);
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
  const refresh = useCallback(() => {
    setGeneration((value) => value + 1);
    reload(false);
  }, [reload]);
  return {
    data,
    loading: busy,
    error: settledLocale === locale ? error : null,
    refresh,
    generation,
  };
}
