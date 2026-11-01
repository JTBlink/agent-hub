import type { GitDiffRow } from "./gitDiff";

/** Alignment gaps are widgets, never fake source lines that could enter the clipboard. */
export function gitDiffPane(rows: GitDiffRow[], side: "left" | "right") {
  const lines: {
    content: string;
    number: number;
    changed: boolean;
    from: number;
    row: number;
  }[] = [];
  const gaps: { before: number; count: number; label?: string; row: number }[] =
    [];
  let offset = 0;
  for (const [index, row] of rows.entries()) {
    const line = row.type === "line" ? row[side] : undefined;
    if (line) {
      lines.push({ ...line, from: offset, row: index });
      offset += line.content.length + 1;
    } else {
      const previous = gaps.at(-1);
      if (
        row.type === "line" &&
        previous &&
        !previous.label &&
        previous.before === lines.length
      )
        previous.count++;
      else
        gaps.push({
          before: lines.length,
          row: index,
          count: 1,
          label: row.type === "hunk" ? row.text : undefined,
        });
    }
  }
  return { content: lines.map((line) => line.content).join("\n"), lines, gaps };
}
