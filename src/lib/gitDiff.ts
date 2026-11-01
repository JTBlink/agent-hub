export interface GitDiffLine {
  number: number;
  content: string;
  changed: boolean;
}
export type GitDiffRow =
  | { type: "hunk"; text: string }
  | { type: "line"; left?: GitDiffLine; right?: GitDiffLine };

/** Align a Git patch directly, preserving hunk line numbers without re-diffing excerpts. */
export function parseGitDiff(patch: string, limit = 3000) {
  const rows: GitDiffRow[] = [];
  let left = 0;
  let right = 0;
  let active = false;
  let removed: GitDiffLine[] = [];
  let added: GitDiffLine[] = [];
  const flush = () => {
    for (let index = 0; index < Math.max(removed.length, added.length); index++)
      rows.push({ type: "line", left: removed[index], right: added[index] });
    removed = [];
    added = [];
  };
  let count = 0;
  let truncated = false;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      flush();
      left = Number(hunk[1]);
      right = Number(hunk[2]);
      active = true;
      rows.push({ type: "hunk", text: line });
    } else if (active && /^[ +-]/.test(line)) {
      if (count++ >= limit) {
        truncated = true;
        break;
      }
      const content = line.slice(1).replace(/\r$/, "");
      if (line[0] === "-") {
        if (added.length) flush();
        removed.push({ number: left++, content, changed: true });
      } else if (line[0] === "+") {
        added.push({ number: right++, content, changed: true });
      } else {
        flush();
        rows.push({
          type: "line",
          left: { number: left++, content, changed: false },
          right: { number: right++, content, changed: false },
        });
      }
    } else if (line && !line.startsWith("\\")) {
      flush();
      active = false;
    }
  }
  flush();
  return { rows, truncated };
}
