import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../../lib/tauri";
export interface TaskSource {
  binding: api.TaskBinding;
  items: api.RepositoryTask[];
  identity: string;
  nextPage: number;
  hasMore: boolean;
  limited: boolean;
  loading: boolean;
  error: api.TaskFailure | null;
}
export function useRepositoryTasks(
  bindings: api.TaskBinding[],
  filters: api.TaskFilters,
  refreshKey = 0,
) {
  const [sources, setSources] = useState<TaskSource[]>([]);
  const generation = useRef(0);
  const knownIdentities = useRef(new Map<string, string>());
  const requests = useRef(new Map<string, string>());
  const load = useCallback(
    async (binding: api.TaskBinding, page: number) => {
      if (requests.current.has(binding.id)) return;
      const scope = generation.current;
      const requestId = crypto.randomUUID();
      requests.current.set(binding.id, requestId);
      setSources((previous) =>
        previous.map((source) =>
          source.binding.id === binding.id
            ? { ...source, loading: true, error: null }
            : source,
        ),
      );
      try {
        const response = await api.getRepositoryTasks(
          binding.id,
          filters,
          page,
          requestId,
        );
        if (scope !== generation.current) return;
        knownIdentities.current.set(JSON.stringify(binding), response.identity);
        setSources((previous) =>
          previous.map((source) => {
            if (source.binding.id !== binding.id) return source;
            const items = new Map(
              (page === 1 ? [] : source.items).map((item) => [item.key, item]),
            );
            response.items.forEach((item) => items.set(item.key, item));
            return {
              ...source,
              items: [...items.values()],
              identity: response.identity,
              nextPage: page + 1,
              hasMore: response.has_more,
              limited: response.limited,
              loading: false,
              error: null,
            };
          }),
        );
      } catch (error) {
        if (scope !== generation.current) return;
        const failure = api.taskFailure(error);
        if (failure.kind === "authentication")
          knownIdentities.current.delete(JSON.stringify(binding));
        setSources((previous) =>
          previous.map((source) =>
            source.binding.id === binding.id
              ? {
                  ...source,
                  loading: false,
                  error: failure,
                  identity:
                    failure.kind === "authentication" ? "" : source.identity,
                }
              : source,
          ),
        );
      } finally {
        if (requests.current.get(binding.id) === requestId)
          requests.current.delete(binding.id);
      }
    },
    [filters],
  );
  useEffect(() => {
    generation.current += 1;
    setSources(
      bindings.map((binding) => ({
        binding,
        items: [],
        identity: knownIdentities.current.get(JSON.stringify(binding)) ?? "",
        nextPage: 1,
        hasMore: false,
        limited: false,
        loading: true,
        error: null,
      })),
    );
    bindings.forEach((binding) => void load(binding, 1));
    const active = requests.current;
    return () => {
      generation.current += 1;
      active.forEach(
        (request) => void api.cancelTaskQuery(request).catch(() => {}),
      );
      active.clear();
    };
  }, [bindings, load, refreshKey]);
  const items = sources
    .flatMap((source) => source.items)
    .sort((first, second) => second.updated_at.localeCompare(first.updated_at));
  return { sources, items, load };
}
