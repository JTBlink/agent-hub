import type { GitFile } from "./gitApi";

const styles = {
  added: { marker: "A", color: "text-success", priority: 1 },
  untracked: { marker: "U", color: "text-success", priority: 1 },
  renamed: { marker: "R", color: "text-success", priority: 2 },
  deleted: { marker: "D", color: "text-danger", priority: 3 },
  modified: { marker: "M", color: "text-warning", priority: 4 },
  conflict: { marker: "!", color: "text-warning", priority: 5 },
} as const;

export type GitFileState = keyof typeof styles;

export interface GitFileDecoration {
  status: keyof typeof styles;
  marker: string;
  color: string;
  priority: number;
}

export interface WorktreeDecoration extends GitFileDecoration {
  count: number;
  counts: Partial<Record<GitFileState, number>>;
}

/** A single status mapping shared by the file explorer and source control. */
export function gitFileDecoration(file: GitFile): GitFileDecoration {
  const status = file.conflicted
    ? "conflict"
    : file.status === "added" && !file.staged
      ? "untracked"
      : file.status in styles
        ? (file.status as GitFileState)
        : "modified";
  return { status, ...styles[status] };
}

/** Index ancestors once; staged and unstaged records of one path count as one file. */
export function worktreeDecorations(files: readonly GitFile[]) {
  const leaves = new Map<string, ReturnType<typeof gitFileDecoration>>();
  for (const file of files) {
    const next = gitFileDecoration(file);
    const previous = leaves.get(file.path);
    if (!previous || next.priority > previous.priority)
      leaves.set(file.path, next);
  }
  const entries = new Map<string, WorktreeDecoration>();
  for (const [file, state] of leaves) {
    const decoration = { ...state, count: 1, counts: { [state.status]: 1 } };
    entries.set(file, decoration);
    const parts = file.split("/");
    parts.pop();
    while (parts.length) {
      const path = parts.join("/");
      const previous = entries.get(path);
      entries.set(path, {
        ...(previous && previous.priority >= decoration.priority
          ? previous
          : decoration),
        count: (previous?.count ?? 0) + 1,
        counts: {
          ...previous?.counts,
          [state.status]: (previous?.counts[state.status] ?? 0) + 1,
        },
      });
      parts.pop();
    }
  }
  return entries;
}
