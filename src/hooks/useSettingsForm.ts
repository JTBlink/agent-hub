import { useCallback, useEffect, useRef, useState } from "react";
import i18next from "i18next";
import { toast } from "sonner";

/** Load each group's settings once, then serialize saves without replacing drafts on locale changes. */
export function useSettingsForm<T>(
  load: () => Promise<T>,
  apply: (value: T) => void,
) {
  const [initial] = useState(() => ({ load, apply }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(false);
  const busy = useRef(false);
  const retry = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const value = await initial.load();
      if (mounted.current) initial.apply(value);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [initial]);
  useEffect(() => {
    mounted.current = true;
    void retry();
    return () => {
      mounted.current = false;
    };
  }, [retry]);
  const save = async (operation: () => Promise<void>) => {
    if (busy.current || failed) return;
    busy.current = true;
    setSaving(true);
    try {
      await operation();
    } catch {
      toast.error(i18next.t("common.error"));
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  return { loading, saving, failed, retry, save };
}
