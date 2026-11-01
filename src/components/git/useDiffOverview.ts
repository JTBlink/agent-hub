import { useCallback } from "react";
import type { EditorView } from "@codemirror/view";
import type { GitDiffRow } from "../../lib/gitDiff";
import type { OverviewMark } from "../ScrollOverview";

/** Use editor line geometry, including wrapped rows and documents shorter than the viewport. */
export function useDiffOverview(
  rows: GitDiffRow[],
  split: boolean,
  original: EditorView | null,
  updated: EditorView | null,
  rowHeights?: readonly number[],
) {
  return useCallback(() => {
    const marks: OverviewMark[] = [];
    if (!updated) return marks;
    const height = Math.max(1, updated.scrollDOM.scrollHeight);
    const mark = (view: EditorView, from: number, kind: string) => {
      if (from > view.state.doc.length) return;
      const block = view.lineBlockAt(from);
      marks.push({
        top: (block.top / height) * 100,
        height: (block.height / height) * 100,
        kind,
      });
    };
    if (split) {
      if (rowHeights) {
        let top = 0;
        rows.forEach((row, index) => {
          const size = rowHeights[index];
          if (row.type === "line" && (row.left?.changed || row.right?.changed))
            marks.push({
              top: (top / height) * 100,
              height: (size / height) * 100,
              kind:
                row.left?.changed && row.right?.changed
                  ? "modified"
                  : row.left?.changed
                    ? "removed"
                    : "added",
            });
          top += size;
        });
        return marks;
      }
      let left = 0,
        right = 0;
      for (const row of rows) {
        if (row.type !== "line") continue;
        if (row.right?.changed)
          mark(updated, right, row.left?.changed ? "modified" : "added");
        else if (row.left?.changed && original) mark(original, left, "removed");
        if (row.left) left += row.left.content.length + 1;
        if (row.right) right += row.right.content.length + 1;
      }
    } else {
      for (let number = 1; number <= updated.state.doc.lines; number++) {
        const line = updated.state.doc.line(number);
        if (/^[+-]/.test(line.text) && !/^(---|\+\+\+)/.test(line.text))
          mark(updated, line.from, line.text[0] === "+" ? "added" : "removed");
      }
    }
    return marks;
  }, [rows, split, original, updated, rowHeights]);
}
