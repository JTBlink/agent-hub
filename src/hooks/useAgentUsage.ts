import { useCallback, useEffect, useRef, useState } from "react";
import { isTransientUsageFailure, type ProviderUsage } from "../lib/agentUsage";
import { getAgentUsage } from "../lib/tauri";

const POLL_MS = 5 * 60_000;
const RETRY_MS = 30_000;

/** One owner in the application shell; route/project changes do not restart it. */
export function useAgentUsage() {
  const [snapshots, setSnapshots] = useState<ProviderUsage[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const generation = useRef(0);
  const nextPoll = useRef(0);

  const refresh = useCallback(async (manual = false) => {
    if (pending.current) return;
    const request = generation.current;
    pending.current = true;
    setLoading(true);
    try {
      const result = await getAgentUsage(manual);
      if (request !== generation.current) return;
      nextPoll.current =
        Date.now() +
        (result.some((snapshot) => isTransientUsageFailure(snapshot.status))
          ? RETRY_MS
          : POLL_MS);
      setSnapshots(result);
      setFailed(false);
    } catch {
      if (request !== generation.current) return;
      nextPoll.current = Date.now() + RETRY_MS;
      setFailed(true);
      // An IPC failure must not leave old percentages looking current.
      setSnapshots([]);
    } finally {
      if (request === generation.current) {
        pending.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const refreshActive = () => {
      if (document.visibilityState === "visible" && document.hasFocus())
        void refresh();
    };
    refreshActive();
    const timer = window.setInterval(() => {
      if (Date.now() >= nextPoll.current) refreshActive();
    }, RETRY_MS);
    window.addEventListener("focus", refreshActive);
    document.addEventListener("visibilitychange", refreshActive);
    return () => {
      generation.current += 1;
      pending.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshActive);
      document.removeEventListener("visibilitychange", refreshActive);
    };
  }, [refresh]);

  return { snapshots, loading, failed, refresh };
}
