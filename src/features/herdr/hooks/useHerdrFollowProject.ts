import { useCallback, useEffect, useRef, useState } from "react";
import { getSettings, setSettings } from "../../../lib/settingsApi";

export const HERDR_FOLLOW_PROJECT_SETTING = "herdr_follow_project";
const CHANGE_EVENT = "agent-hub:herdr-follow-project-changed";

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
    let changed = false;
    const receive = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "boolean")
        return;
      changed = true;
      setEnabled(event.detail);
      setError(false);
    };
    window.addEventListener(CHANGE_EVENT, receive);
    void getSettings(HERDR_FOLLOW_PROJECT_SETTING)
      .then((value) => {
        if (!cancelled && !changed) setEnabled(value === "true");
      })
      .catch(() => {
        if (!cancelled && !changed) setError(true);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      mounted.current = false;
      window.removeEventListener(CHANGE_EVENT, receive);
    };
  }, []);
  const change = useCallback(async (next: boolean) => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError(false);
    try {
      await setSettings(HERDR_FOLLOW_PROJECT_SETTING, String(next));
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
    } catch {
      if (mounted.current) setError(true);
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }, []);
  return { enabled, ready, saving, error, change };
}
