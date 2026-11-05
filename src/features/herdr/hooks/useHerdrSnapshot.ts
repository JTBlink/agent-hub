import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api";
import { DEFAULT_HERDR_SESSION } from "../lib/herdrControlApi";
import { getErrorMessage } from "../../../lib/error";
import { useTranslation } from "react-i18next";

export function useHerdrSnapshot(active: boolean) {
  const { t } = useTranslation();
  const fallback = t("common.error");
  const [inventory, setInventory] = useState<Awaited<
    ReturnType<typeof api.getHerdrInventory>
  > | null>(null);
  const [selectedSession, setSelectedSession] = useState(DEFAULT_HERDR_SESSION);
  const session = inventory?.sessions.some((s) => s.name === selectedSession)
    ? selectedSession
    : DEFAULT_HERDR_SESSION;
  const running = inventory?.sessions.some(
    (s) => s.name === session && s.running,
  );
  const [data, setData] = useState<{
    session: string;
    value: api.HerdrSnapshot;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setSession = (name: string) => {
    setSelectedSession(name);
    setError("");
    setLoading(false);
  };
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  const generation = useRef(0);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void api
      .getHerdrInventory()
      .then((value) => {
        if (cancelled) return;
        setInventory(value);
      })
      .catch((error) => {
        if (!cancelled) setError(getErrorMessage(error, fallback));
      });
    return () => {
      cancelled = true;
    };
  }, [active, revision, fallback]);
  useEffect(() => {
    if (!active || !running) return;
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
  }, [active, session, running, revision, fallback]);
  return {
    inventory,
    session,
    setSession,
    snapshot: running && data?.session === session ? data.value : null,
    error,
    loading,
    refresh,
  };
}
