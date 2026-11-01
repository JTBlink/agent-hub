import { useEffect, useState } from "react";
import { getProjectGitGraph, type GitGraphData } from "../lib/gitApi";

export function useGitGraph(
  projectId: string,
  worktreePath: string | undefined,
  remotes: boolean,
  limit: number,
  revision: number,
) {
  const scope = JSON.stringify([projectId, worktreePath, remotes]);
  const key = JSON.stringify([
    projectId,
    worktreePath,
    remotes,
    limit,
    revision,
  ]);
  const [result, setResult] = useState<{
    key: string;
    scope: string;
    data?: GitGraphData;
    error?: unknown;
  }>();
  useEffect(() => {
    let cancelled = false;
    void getProjectGitGraph(projectId, worktreePath, remotes, limit).then(
      (data) => {
        if (!cancelled) setResult({ key, scope, data });
      },
      (error: unknown) => {
        if (!cancelled)
          setResult((previous) => ({
            key,
            scope,
            error,
            data: previous?.scope === scope ? previous.data : undefined,
          }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, worktreePath, remotes, limit, revision, key, scope]);
  return result?.scope === scope
    ? { ...result, loading: result.key !== key }
    : undefined;
}
