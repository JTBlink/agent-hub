import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { useTranslation } from "react-i18next";

export function useHerdrSnapshot(active: boolean) {
  const { t } = useTranslation();
  const fallback = t("common.error");
  const [inventory, setInventory] = useState<Awaited<
    ReturnType<typeof api.getHerdrInventory>
  > | null>(null);
  const [session, setSessionValue] = useState("");
  const [managedSession, setManagedSession] = useState("");
  const prepared = useRef(false);
  const [data, setData] = useState<{
    session: string;
    value: api.HerdrSnapshot;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  const generation = useRef(0);
  const setSession = setSessionValue;
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void api
      .getHerdrInventory()
      .then(async (value) => {
        if (cancelled) return;
        if (value.installed && !prepared.current) {
          const name = await api.prepareHerdrSession();
          if (cancelled) return;
          prepared.current = true;
          setManagedSession(name);
          setSessionValue(name);
          const inventory = await api.getHerdrInventory();
          if (!cancelled) setInventory(inventory);
          return;
        }
        setInventory(value);
        if (!value.sessions.some((s) => s.name === session))
          setSessionValue(
            value.sessions.find((s) => s.default && s.running)?.name ??
              value.sessions.find((s) => s.running)?.name ??
              value.sessions[0]?.name ??
              "",
          );
      })
      .catch((error) => {
        if (!cancelled) setError(getErrorMessage(error, fallback));
      });
    return () => {
      cancelled = true;
    };
  }, [active, revision, session, fallback]);
  useEffect(() => {
    if (!active || !session) return;
    const token = ++generation.current;
    let stopped = false,
      pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (
        pending ||
        stopped ||
        document.visibilityState === "hidden" ||
        !document.hasFocus()
      )
        return;
      pending = true;
      setLoading(true);
      try {
        const value = await api.getHerdrSnapshot(session);
        if (!stopped && generation.current === token) {
          setData({ session, value });
          setError("");
        }
      } catch (error) {
        if (!stopped && generation.current === token)
          setError(getErrorMessage(error, fallback));
      } finally {
        pending = false;
        if (!stopped && generation.current === token) {
          setLoading(false);
          timer = setTimeout(() => void poll(), 5000);
        }
      }
    };
    const wake = () => {
      if (timer) clearTimeout(timer);
      void poll();
    };
    void poll();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [active, session, revision, fallback]);
  return {
    inventory,
    managedSession,
    session,
    setSession,
    snapshot: data?.session === session ? data.value : null,
    error,
    loading,
    refresh,
  };
}
