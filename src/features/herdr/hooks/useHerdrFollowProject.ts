import { useCallback, useEffect, useRef, useState } from "react";
import { getSettings, setSettings } from "../../../lib/tauri";

const SETTING_KEY = "herdr_follow_project";

/** Missing/invalid settings fail closed; changes take effect only after saving. */
export function useHerdrFollowProject() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void getSettings(SETTING_KEY)
      .then((value) => {
        if (!cancelled) setEnabled(value === "true");
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, []);
  const change = useCallback(async (next: boolean) => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError(false);
    try {
      await setSettings(SETTING_KEY, String(next));
      if (mounted.current) setEnabled(next);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }, []);
  return { enabled, ready, saving, error, change };
}
