import type { GitDiffRow } from "./gitDiff";

/** Source offsets for each contiguous change, in the two source documents and patch. */
export function gitDiffNavigation(rows: GitDiffRow[], patch: string) {
  const targets: {
    row: number;
    left?: number;
    right?: number;
    unified: number;
  }[] = [];
  let left = 0,
    right = 0,
    changing = false;
  for (const [index, row] of rows.entries()) {
    const changed =
      row.type === "line" && (row.left?.changed || row.right?.changed);
    if (changed && !changing)
      targets.push({
        row: index,
        left: row.type === "line" && row.left?.changed ? left : undefined,
        right: row.type === "line" && row.right?.changed ? right : undefined,
        unified: 0,
      });
    changing = !!changed;
    if (row.type === "line") {
      if (row.left) left += row.left.content.length + 1;
      if (row.right) right += row.right.content.length + 1;
    }
  }
  let offset = 0,
    group = 0,
    active = false;
  changing = false;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("@@")) active = true;
    const changed = active && /^[+-]/.test(line);
    if (changed && !changing && targets[group])
      targets[group++].unified = offset;
    changing = changed;
    offset += line.length + 1;
  }
  return targets;
}
