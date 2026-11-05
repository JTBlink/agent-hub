import { invoke } from "@tauri-apps/api/core";
import type { GitStatus } from "./gitApi";

const FRESH_MS = 10000;
const MAX_CHECKOUTS = 16;
interface StatusRead {
  version: number;
  expires: number;
  data?: GitStatus;
  pending?: Promise<GitStatus>;
}
const reads = new Map<string, StatusRead>();
const keyFor = (projectId: string, worktreePath?: string) =>
  JSON.stringify([projectId, worktreePath]);

/** Show this checkout's last snapshot while a fresh read keeps actions disabled. */
export function peekProjectGitStatus(projectId: string, worktreePath?: string) {
  return reads.get(keyFor(projectId, worktreePath))?.data;
}

/** Changes expire snapshots; an ongoing scan finishes before one fresh scan runs. */
export function invalidateProjectGitStatus(
  projectId?: string,
  worktreePath?: string,
) {
  const targets = projectId
    ? [reads.get(keyFor(projectId, worktreePath))]
    : reads.values();
  for (const entry of targets) {
    if (!entry) continue;
    entry.version += 1;
    entry.expires = 0;
  }
}

// One fixed set of listeners for this application-wide query cache, without polling.
window.addEventListener("project-git-changed", () =>
  invalidateProjectGitStatus(),
);
window.addEventListener("worktree-file-saved", () =>
  invalidateProjectGitStatus(),
);
window.addEventListener("focus", () => invalidateProjectGitStatus());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) invalidateProjectGitStatus();
});

/** Sidebar and source control share scans and a snapshot for one polling interval. */
export function getProjectGitStatus(
  projectId: string,
  worktreePath?: string,
): Promise<GitStatus> {
  const key = keyFor(projectId, worktreePath);
  const entry = reads.get(key) ?? { version: 0, expires: 0 };
  reads.delete(key);
  reads.set(key, entry);
  if (entry.pending) return entry.pending;
  if (entry.data && entry.expires > Date.now())
    return Promise.resolve(entry.data);
  const read = async (): Promise<GitStatus> => {
    try {
      for (;;) {
        const version = entry.version;
        const data = await invoke<GitStatus>("get_project_git_status", {
          projectId,
          worktreePath,
        });
        if (version !== entry.version) continue;
        entry.data = data;
        entry.expires = Date.now() + FRESH_MS;
        return data;
      }
    } finally {
      entry.pending = undefined;
      for (const [oldKey, old] of reads) {
        if (reads.size <= MAX_CHECKOUTS) break;
        if (!old.pending) reads.delete(oldKey);
      }
    }
  };
  entry.pending = read();
  return entry.pending;
}
