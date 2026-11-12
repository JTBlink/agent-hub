import { useCallback, useEffect, useRef, useState } from "react";
import { getSettings, setSettings, type AutomationTask } from "../lib/tauri";
import {
  applyAutomationOrder,
  moveAutomationTask,
  parseAutomationOrder,
} from "../lib/automationOrder";

const SETTING_KEY = "automation_task_order";

export function useAutomationTaskOrder(tasks: AutomationTask[]) {
  const [order, setOrder] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const orderRef = useRef(order);

  useEffect(() => {
    let cancelled = false;
    void getSettings(SETTING_KEY)
      .then((value) => {
        if (cancelled) return;
        orderRef.current = parseAutomationOrder(value);
        setOrder(orderRef.current);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const move = useCallback(
    async (activeId: string, overId: string) => {
      if (!ready) return;
      const previous = orderRef.current;
      const next = moveAutomationTask(tasks, previous, activeId, overId);
      orderRef.current = next;
      setOrder(next);
      try {
        await setSettings(SETTING_KEY, JSON.stringify(next));
      } catch (error) {
        orderRef.current = previous;
        setOrder(previous);
        throw error;
      }
    },
    [ready, tasks],
  );

  return { sorted: applyAutomationOrder(tasks, order), ready, move };
}
