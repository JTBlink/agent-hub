import { useEffect, useState } from "react";
import { getSystemLoad } from "../lib/tauri";
import { loadPercent, type SystemLoadSnapshot } from "../lib/systemLoad";

/** Poll only while visible, with no overlapping requests or updates after cleanup. */
export function useSystemLoad() {
  const [snapshot, setSnapshot] = useState<SystemLoadSnapshot | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (disposed || pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const next = await getSystemLoad();
        if (disposed) return;
        setSnapshot(next);
        setFailed(false);
        const cpu = loadPercent(next.cpu_percent);
        if (cpu !== null)
          setHistory((previous) => [...previous.slice(-15), cpu]);
      } catch {
        if (!disposed) {
          setSnapshot(null);
          setHistory([]);
          setFailed(true);
        }
      } finally {
        pending = false;
      }
    };
    void refresh();
    const onVisible = () => void refresh();
    const timer = window.setInterval(onVisible, 2000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { snapshot, history, failed };
}
