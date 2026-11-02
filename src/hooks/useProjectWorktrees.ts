import { useEffect, useSyncExternalStore } from "react";
import { getProjectWorktrees, type ProjectWorktree } from "../lib/worktreeApi";
import i18n from "../i18n";
import { getErrorMessage } from "../lib/error";

interface Snapshot {
  worktrees: ProjectWorktree[];
  loading: boolean;
  error: string;
}
const empty: Snapshot = { worktrees: [], loading: false, error: "" };
const cache = new Map<string, Snapshot>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function publish(id: string, snapshot: Snapshot) {
  cache.set(id, snapshot);
  listeners.forEach((listener) => listener());
}
/** Reuse a validated discovery result from explicit open/remove actions. */
export function cacheProjectWorktrees(
  id: string,
  worktrees: ProjectWorktree[],
) {
  publish(id, { worktrees, loading: false, error: "" });
}
export function refreshProjectWorktrees(id: string) {
  const existing = pending.get(id);
  if (existing) return existing;
  publish(id, { ...(cache.get(id) ?? empty), loading: true, error: "" });
  const request = getProjectWorktrees(id)
    .then(
      (worktrees) => cacheProjectWorktrees(id, worktrees),
      (cause) =>
        publish(id, {
          ...(cache.get(id) ?? empty),
          loading: false,
          error: getErrorMessage(cause, i18n.t("common.error")),
        }),
    )
    .finally(() => {
      pending.delete(id);
    });
  pending.set(id, request);
  return request;
}

/** Sidebar and workspace share one snapshot; focus/manual refresh discovers changes. */
export function useProjectWorktrees(projectId?: string) {
  const snapshot = useSyncExternalStore(subscribe, () =>
    projectId ? (cache.get(projectId) ?? empty) : empty,
  );
  useEffect(() => {
    if (!projectId) return;
    if (!cache.has(projectId)) void refreshProjectWorktrees(projectId);
    const refresh = () => {
      void refreshProjectWorktrees(projectId);
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("project-git-changed", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("project-git-changed", refresh);
    };
  }, [projectId]);
  return {
    ...snapshot,
    refresh: () =>
      projectId ? refreshProjectWorktrees(projectId) : Promise.resolve(),
  };
}
