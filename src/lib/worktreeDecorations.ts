import type { GitFile } from "./gitApi";

const styles = {
  added: { marker: "A", color: "text-success", priority: 1 },
  untracked: { marker: "U", color: "text-success", priority: 1 },
  renamed: { marker: "R", color: "text-success", priority: 2 },
  deleted: { marker: "D", color: "text-danger", priority: 3 },
  modified: { marker: "M", color: "text-warning", priority: 4 },
  conflict: { marker: "!", color: "text-danger", priority: 5 },
} as const;

export interface WorktreeDecoration {
  status: keyof typeof styles;
  marker: string;
  color: string;
  priority: number;
  count: number;
}

/** Index ancestors once so collapsed and unloaded folders also show changes. */
export function worktreeDecorations(files: readonly GitFile[]) {
  const entries = new Map<string, WorktreeDecoration>();
  for (const file of files) {
    const status = file.conflicted
      ? "conflict"
      : file.status === "added" && !file.staged
        ? "untracked"
        : file.status in styles
          ? (file.status as keyof typeof styles)
          : "modified";
    const decoration = { status, ...styles[status], count: 1 };
    entries.set(file.path, decoration);
    const parts = file.path.split("/");
    parts.pop();
    while (parts.length) {
      const path = parts.join("/");
      const previous = entries.get(path);
      entries.set(path, {
        ...(previous && previous.priority >= decoration.priority
          ? previous
          : decoration),
        count: (previous?.count ?? 0) + 1,
      });
      parts.pop();
    }
  }
  return entries;
}
