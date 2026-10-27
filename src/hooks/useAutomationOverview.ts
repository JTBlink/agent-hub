import { useEffect, useRef, useState } from "react";
import { getAutomationOverview, type AutomationOverview } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";

export function useAutomationOverview(locale: string) {
  const [data, setData] = useState<AutomationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [settledLocale, setSettledLocale] = useState<string | null>(null);
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
          setData(value);
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
  const refresh = () => {
    request.current = null;
    setLoading(true);
    setError(null);
    setAttempt((value) => value + 1);
  };
  return {
    data,
    loading: busy,
    error: settledLocale === locale ? error : null,
    refresh,
  };
}
