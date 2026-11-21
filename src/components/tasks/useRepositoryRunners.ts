import { useMemo } from "react";
import {
  getRepositoryRunners,
  type RepositoryRunner,
  type TaskBinding,
} from "../../lib/taskBrowserApi";
import { useRepositoryInventory } from "./useRepositoryInventory";

export type VisibleRunner = {
  key: string;
  runner: RepositoryRunner;
  bindings: TaskBinding[];
  assignable: boolean;
};

export function useRepositoryRunners(
  bindings: TaskBinding[],
  refreshKey: number,
  scopeKey: string,
  discovering: boolean,
) {
  const result = useRepositoryInventory(
    bindings,
    refreshKey,
    scopeKey,
    discovering,
    getRepositoryRunners,
  );
  const { sources } = result;
  const items = useMemo(() => {
    const entries = new Map<string, VisibleRunner>();
    for (const { binding, inventory } of sources) {
      for (const [assignable, runners] of [
        [false, inventory?.items ?? []],
        [true, inventory?.assignable ?? []],
      ] as const)
        for (const runner of runners) {
          const key = JSON.stringify([
            binding.provider,
            binding.host.toLowerCase(),
            runner.id,
            assignable,
          ]);
          const existing = entries.get(key);
          if (!existing)
            entries.set(key, { key, runner, bindings: [binding], assignable });
          else if (!existing.bindings.includes(binding))
            existing.bindings.push(binding);
        }
    }
    return [...entries.values()];
  }, [sources]);
  return { ...result, items };
}
