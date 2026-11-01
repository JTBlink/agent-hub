import { useEffect, useState } from "react";
import { getProjectGitGraph, type GitGraphData } from "../lib/gitApi";

export function useGitGraph(
  projectId: string,
  worktreePath: string | undefined,
  remotes: boolean,
  limit: number,
  revision: number,
) {
  const key = JSON.stringify([
    projectId,
    worktreePath,
    remotes,
    limit,
    revision,
  ]);
  const [result, setResult] = useState<{
    key: string;
    data?: GitGraphData;
    error?: unknown;
  }>();
  useEffect(() => {
    let cancelled = false;
    void getProjectGitGraph(projectId, worktreePath, remotes, limit).then(
      (data) => {
        if (!cancelled) setResult({ key, data });
      },
      (error: unknown) => {
        if (!cancelled) setResult({ key, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, worktreePath, remotes, limit, revision, key]);
  return result?.key === key ? result : undefined;
}
