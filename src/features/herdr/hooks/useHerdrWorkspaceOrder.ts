import { useCallback, useEffect, useRef, useState } from "react";
import { getSettings, setSettings } from "../../../lib/tauri";
import type { HerdrWorkspace } from "../lib/herdrControlApi";
import {
  moveHerdrWorkspaceRoot,
  reconcileHerdrWorkspaceOrder,
} from "../lib/herdrWorkspaces";

const SETTING_KEY = "herdr_workspace_order";

type WorkspaceOrders = Record<string, string[]>;

export function parseHerdrWorkspaceOrders(
  value: string | null,
): WorkspaceOrders {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([session, order]) =>
        Array.isArray(order) && order.every((id) => typeof id === "string")
          ? [[session, order]]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

export function mergeHerdrWorkspaceOrder(
  value: string | null,
  session: string,
  order: string[],
) {
  return { ...parseHerdrWorkspaceOrders(value), [session]: order };
}

export function useHerdrWorkspaceOrder(
  session: string,
  spaces: HerdrWorkspace[],
) {
  const [orders, setOrders] = useState<WorkspaceOrders>({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const ordersRef = useRef(orders);

  useEffect(() => {
    let cancelled = false;
    void getSettings(SETTING_KEY)
      .then((value) => {
        if (cancelled) return;
        const stored = parseHerdrWorkspaceOrders(value);
        ordersRef.current = stored;
        setOrders(stored);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const order = reconcileHerdrWorkspaceOrder(spaces, orders[session] ?? []);
  const move = useCallback(
    async (activeId: string, overId: string) => {
      if (!ready || saving) return;
      const previous = ordersRef.current;
      const nextOrder = moveHerdrWorkspaceRoot(
        spaces,
        previous[session] ?? [],
        activeId,
        overId,
      );
      if (nextOrder.every((id, index) => id === order[index])) return;
      const optimistic = { ...previous, [session]: nextOrder };
      ordersRef.current = optimistic;
      setOrders(optimistic);
      setSaving(true);
      try {
        const next = mergeHerdrWorkspaceOrder(
          await getSettings(SETTING_KEY),
          session,
          nextOrder,
        );
        await setSettings(SETTING_KEY, JSON.stringify(next));
        ordersRef.current = next;
        setOrders(next);
      } catch (error) {
        ordersRef.current = previous;
        setOrders(previous);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [order, ready, saving, session, spaces],
  );

  return { order, ready, saving, move };
}
