import { useEffect, useState } from "react";
import {
  readTaskStartPreferences,
  saveTaskStartPreferences,
  defaultTaskStartPreferences,
  type TaskStartPreferences,
} from "../lib/taskStartPreferences";

/** Save reusable options per project, with a synchronous flush when leaving. */
export function useTaskStartPreferences(projectId: string) {
  const [preferences, setPreferences] = useState(() =>
    readTaskStartPreferences(projectId),
  );
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSaveFailed(!saveTaskStartPreferences(projectId, preferences));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [projectId, preferences]);
  return {
    preferences,
    saveFailed,
    update: (patch: Partial<TaskStartPreferences>) =>
      setPreferences((previous) => ({ ...previous, ...patch })),
    reset: () => setPreferences({ ...defaultTaskStartPreferences }),
    flush: () => saveTaskStartPreferences(projectId, preferences),
  };
}
