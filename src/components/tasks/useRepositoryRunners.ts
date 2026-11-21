import { useEffect, useMemo, useState } from "react";
import {
  cancelTaskQuery,
  getRepositoryRunners,
  taskFailure,
  type RepositoryRunner,
  type RepositoryRunnerInventory,
  type TaskBinding,
  type TaskFailure,
} from "../../lib/taskBrowserApi";

type Source = {
  binding: TaskBinding;
  inventory?: RepositoryRunnerInventory;
  error?: TaskFailure;
};
export type VisibleRunner = {
  key: string;
  runner: RepositoryRunner;
  bindings: TaskBinding[];
};

export function useRepositoryRunners(
  bindings: TaskBinding[],
  refreshKey: number,
) {
  const [result, setResult] = useState<{
    bindings: TaskBinding[];
    sources: Source[];
    refreshKey: number;
    updatedAt: Date | null;
  }>();
  useEffect(() => {
    const pending = new Set<string>();
    let disposed = false;
    let offset = 0;
    const sources: Source[] = [];
    async function load() {
      while (!disposed && offset < bindings.length) {
        const index = offset++;
        const binding = bindings[index];
        const id = crypto.randomUUID();
        pending.add(id);
        try {
          sources[index] = {
            binding,
            inventory: await getRepositoryRunners(binding.id, id),
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
      if (!disposed)
        setResult({
          bindings,
          refreshKey,
          sources,
          updatedAt: sources.some((source) => source.inventory)
            ? new Date()
            : null,
        });
    });
    return () => {
      disposed = true;
      pending.forEach((id) => void cancelTaskQuery(id).catch(() => {}));
    };
  }, [bindings, refreshKey]);
  const current = result?.bindings === bindings ? result : undefined;
  const sources = current?.sources;
  const items = useMemo(() => {
    const entries = new Map<string, VisibleRunner>();
    for (const { binding, inventory } of sources ?? []) {
      for (const runner of inventory?.items ?? []) {
        const key = JSON.stringify([
          binding.provider,
          binding.host.toLowerCase(),
          runner.id,
        ]);
        const existing = entries.get(key);
        if (!existing) entries.set(key, { key, runner, bindings: [binding] });
        else if (!existing.bindings.includes(binding))
          existing.bindings.push(binding);
      }
    }
    return [...entries.values()];
  }, [sources]);
  return {
    items,
    sources: sources ?? [],
    updatedAt: current?.updatedAt,
    loading: bindings.length > 0 && current?.refreshKey !== refreshKey,
  };
}
