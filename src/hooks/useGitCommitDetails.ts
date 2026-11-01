import { useEffect, useState } from "react";
import { getProjectGitCommit, type GitCommitDetails } from "../lib/gitApi";

const requests = new Map<string, Promise<GitCommitDetails>>();
function inspect(
  projectId: string,
  worktreePath: string | undefined,
  sha: string,
) {
  const key = JSON.stringify([projectId, worktreePath, sha]);
  const existing = requests.get(key);
  if (existing) return existing;
  const request = getProjectGitCommit(projectId, worktreePath, sha);
  if (requests.size >= 100) requests.delete(requests.keys().next().value!);
  requests.set(key, request);
  void request.catch(() => {
    if (requests.get(key) === request) requests.delete(key);
  });
  return request;
}

/** Commit objects are immutable; share bounded inspection requests between hover and tree. */
export function useGitCommitDetails(
  projectId: string,
  worktreePath: string | undefined,
  sha: string,
  revision = 0,
) {
  const key = JSON.stringify([projectId, worktreePath, sha, revision]);
  const [response, setResponse] = useState<{
    key: string;
    data?: GitCommitDetails;
    error?: unknown;
  }>();
  useEffect(() => {
    let cancelled = false;
    void inspect(projectId, worktreePath, sha).then(
      (data) => {
        if (!cancelled) setResponse({ key, data });
      },
      (error) => {
        if (!cancelled) setResponse({ key, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, worktreePath, sha, key]);
  return response?.key === key ? response : undefined;
}
