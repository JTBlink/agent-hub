import { useEffect, useRef, useState } from "react";
import { getProjectGitHistory, type GitStatus } from "../lib/gitApi";

type Commits = GitStatus["commits"];
interface PageState {
  scope: string;
  key: string;
  commits: Commits;
  hasMore: boolean;
  error?: unknown;
}

/** Shared immutable-commit pagination for preloaded recent history and reference history. */
export function useGitHistoryPages({
  projectId,
  worktreePath,
  sha,
  initial,
  enabled = true,
}: {
  projectId?: string;
  worktreePath?: string;
  sha?: string;
  initial?: Commits;
  enabled?: boolean;
}) {
  const scope = JSON.stringify([projectId, worktreePath, sha]);
  const [cursor, setCursor] = useState<{
    scope: string;
    offset: number;
    revision: number;
  }>();
  const [response, setResponse] = useState<PageState>();
  const initialRef = useRef(initial);
  useEffect(() => {
    initialRef.current = initial;
  }, [initial]);
  const currentCursor = cursor?.scope === scope ? cursor : undefined;
  const offset =
    currentCursor?.offset ?? (initial === undefined ? 0 : undefined);
  const key = JSON.stringify([scope, offset, currentCursor?.revision ?? 0]);
  const result = response?.scope === scope ? response : undefined;
  const completed = result?.key === key;
  useEffect(() => {
    if (!enabled || !projectId || !sha || offset === undefined || completed)
      return;
    let cancelled = false;
    void getProjectGitHistory(projectId, worktreePath, sha, offset).then(
      (page) => {
        if (!cancelled)
          setResponse((previous) => ({
            scope,
            key,
            commits:
              offset === 0
                ? page.commits
                : [
                    ...(previous?.scope === scope
                      ? previous.commits
                      : (initialRef.current ?? [])),
                    ...page.commits,
                  ],
            hasMore: page.has_more,
          }));
      },
      (error) => {
        if (!cancelled)
          setResponse((previous) => ({
            scope,
            key,
            commits:
              previous?.scope === scope
                ? previous.commits
                : (initialRef.current ?? []),
            hasMore: previous?.scope === scope ? previous.hasMore : true,
            error,
          }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, worktreePath, sha, offset, key, scope, enabled, completed]);
  const commits = result?.commits ?? initial ?? [];
  const loading =
    enabled && !!projectId && !!sha && offset !== undefined && !completed;
  const hasMore =
    !!projectId &&
    !!sha &&
    (result?.hasMore ?? (initial === undefined || initial.length >= 30));
  return {
    commits,
    exhausted: result?.hasMore === false && commits.length > 0,
    loading,
    hasMore,
    error: result?.error,
    loadMore: () => {
      if (!loading)
        setCursor({
          scope,
          offset: commits.length,
          revision: (currentCursor?.revision ?? 0) + 1,
        });
    },
    retry: () => {
      if (!loading)
        setCursor({
          scope,
          offset: offset ?? commits.length,
          revision: (currentCursor?.revision ?? 0) + 1,
        });
    },
  };
}
