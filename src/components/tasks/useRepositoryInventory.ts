import { useEffect, useMemo, useState } from "react";
import {
  cancelTaskQuery,
  taskFailure,
  type TaskBinding,
  type TaskFailure,
} from "../../lib/taskBrowserApi";

type InventorySource<T> = {
  binding: TaskBinding;
  inventory?: T;
  error?: TaskFailure;
};

function bindingKey(binding: TaskBinding) {
  return JSON.stringify([
    binding.id,
    binding.project_id,
    binding.provider,
    binding.host,
    binding.repository,
    binding.launcher?.program,
    binding.launcher?.args,
  ]);
}

function retainsInventory(error: TaskFailure | undefined) {
  return (
    error?.kind === "network" ||
    error?.kind === "rate_limit" ||
    error?.kind === "internal"
  );
}

export function useRepositoryInventory<T>(
  bindings: TaskBinding[],
  refreshKey: number,
  scopeKey: string,
  discovering: boolean,
  query: (bindingId: string, requestId: string) => Promise<T>,
) {
  const [result, setResult] = useState<{
    scopeKey: string;
    bindings: TaskBinding[];
    sources: InventorySource<T>[];
    refreshKey: number;
    updatedAt: Date | null;
  }>();
  useEffect(() => {
    if (discovering) return;
    const pending = new Set<string>();
    let disposed = false;
    let offset = 0;
    const sources: InventorySource<T>[] = [];
    async function load() {
      while (!disposed && offset < bindings.length) {
        const index = offset++;
        const binding = bindings[index];
        const id = crypto.randomUUID();
        pending.add(id);
        try {
          sources[index] = {
            binding,
            inventory: await query(binding.id, id),
          };
        } catch (error) {
          sources[index] = { binding, error: taskFailure(error) };
        } finally {
          pending.delete(id);
        }
      }
    }
    const workers = Array.from({ length: Math.min(4, bindings.length) }, load);
    void Promise.all(workers).then(() => {
      if (disposed) return;
      setResult((previous) => {
        const baseline = previous?.scopeKey === scopeKey ? previous : undefined;
        const cached = new Map(
          baseline?.sources.map((source) => [
            bindingKey(source.binding),
            source.inventory,
          ]),
        );
        return {
          scopeKey,
          bindings,
          refreshKey,
          sources: sources.map((source) =>
            retainsInventory(source.error)
              ? { ...source, inventory: cached.get(bindingKey(source.binding)) }
              : source,
          ),
          updatedAt: sources.some((source) => source.inventory)
            ? new Date()
            : (baseline?.updatedAt ?? null),
        };
      });
    });
    return () => {
      disposed = true;
      pending.forEach((id) => void cancelTaskQuery(id).catch(() => {}));
    };
  }, [bindings, discovering, query, refreshKey, scopeKey]);
  const current = result?.scopeKey === scopeKey ? result : undefined;
  const sources = useMemo(() => {
    const active = new Set(bindings.map(bindingKey));
    return (
      current?.sources.filter((source) =>
        active.has(bindingKey(source.binding)),
      ) ?? []
    );
  }, [bindings, current]);
  return {
    sources,
    updatedAt: current?.updatedAt,
    loading:
      bindings.length > 0 &&
      (current?.bindings !== bindings || current.refreshKey !== refreshKey),
  };
}
