import { useEffect, useState } from "react";
import { getProjectGitStatus } from "../lib/gitApi";
import { groupGitChanges } from "../lib/gitChanges";

/** Hide previous checkout counts and discard stale status responses. */
export function useGitChangeCount(projectId?: string, worktreePath?: string) {
  const key = JSON.stringify([projectId, worktreePath]);
  const [result, setResult] = useState<{
    key: string;
    count: number;
    truncated: boolean;
  }>();
  useEffect(() => {
    if (!projectId) return;
    let disposed = false;
    let revision = 0;
    const refresh = () => {
      if (document.hidden) return;
      const request = ++revision;
      void getProjectGitStatus(projectId, worktreePath).then(
        (status) => {
          if (!disposed && request === revision)
            setResult({
              key,
              count: groupGitChanges(status.files).count,
              truncated: status.truncated,
            });
        },
        () => {
          if (!disposed && request === revision) setResult(undefined);
        },
      );
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("worktree-file-saved", refresh);
    window.addEventListener("project-git-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 10000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("worktree-file-saved", refresh);
      window.removeEventListener("project-git-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [key, projectId, worktreePath]);
  return result?.key === key ? result : undefined;
}
