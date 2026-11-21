import { useEffect, useState } from "react";
import { cancelTaskQuery } from "../../lib/taskBrowserApi";
import {
  getScheduleProgress,
  type ScheduleProgress,
} from "../../lib/repositoryScheduleApi";

const activeStatuses = new Set([
  "running",
  "in_progress",
  "queued",
  "pending",
  "created",
  "preparing",
  "waiting_for_resource",
  "waiting",
  "requested",
  "scheduled",
  "canceling",
]);

export function isLiveScheduleRun(status: string | null) {
  return status !== null && activeStatuses.has(status);
}

export interface ScheduleProgressTarget {
  key: string;
  bindingId: string;
  runId: number;
}

export type ScheduleProgressResult =
  { progress: ScheduleProgress } | { unavailable: true };

export function useScheduleProgress(
  targets: ScheduleProgressTarget[],
  scopeKey: string,
) {
  const [result, setResult] = useState<{
    scopeKey: string;
    results: Record<string, ScheduleProgressResult>;
  }>();
  useEffect(() => {
    if (targets.length === 0) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<string>();
    const terminal = new Set<string>();
    async function poll() {
      if (disposed) return;
      if (document.visibilityState !== "hidden") {
        const active = targets.filter((target) => !terminal.has(target.key));
        let next = 0;
        const results: Record<string, ScheduleProgressResult> = {};
        async function read() {
          while (!disposed && next < active.length) {
            const target = active[next++];
            const id = crypto.randomUUID();
            pending.add(id);
            try {
              const progress = await getScheduleProgress(
                target.bindingId,
                target.runId,
                id,
              );
              results[target.key] = { progress };
              if (progress.status && !isLiveScheduleRun(progress.status))
                terminal.add(target.key);
            } catch {
              results[target.key] = { unavailable: true };
            } finally {
              pending.delete(id);
            }
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(4, active.length) }, read),
        );
        if (!disposed && Object.keys(results).length > 0) {
          setResult((previous) => ({
            scopeKey,
            results: {
              ...(previous?.scopeKey === scopeKey ? previous.results : {}),
              ...results,
            },
          }));
        }
      }
      if (!disposed && terminal.size < targets.length)
        timer = setTimeout(() => void poll(), 15_000);
    }
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      for (const id of pending) void cancelTaskQuery(id).catch(() => {});
    };
  }, [scopeKey, targets]);
  return result?.scopeKey === scopeKey ? result.results : {};
}
