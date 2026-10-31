import { useEffect } from "react";
import type { AutomationTask } from "../lib/tauri";

type ScheduledTask = Pick<
  AutomationTask,
  "next_run" | "status" | "definition" | "installation"
>;

/** Revalidate at the next scheduled boundary, rather than polling every task. */
export function useAutomationNextRunRefresh(
  tasks: readonly ScheduledTask[] | undefined,
  refresh: () => void,
) {
  useEffect(() => {
    const times = (tasks ?? [])
      .filter(
        (task) =>
          task.status !== "paused" &&
          task.definition?.schedule.kind !== "manual" &&
          (!task.installation || task.installation === "installed"),
      )
      .map((task) => (task.next_run ? Date.parse(task.next_run) : NaN))
      .filter(Number.isFinite);
    if (!times.length) return;
    const remaining = Math.min(...times) - Date.now();
    let timer: number;
    const revalidate = () => {
      if (document.visibilityState === "hidden") return;
      // A failed read keeps the old snapshot; retry without an immediate loop.
      timer = window.setTimeout(revalidate, 60_000);
      refresh();
    };
    timer = window.setTimeout(
      revalidate,
      Math.min(remaining > 0 ? remaining + 1_000 : 60_000, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [tasks, refresh]);
}
