import { useMemo } from "react";
import {
  Decoration,
  EditorView,
  GutterMarker,
  WidgetType,
  gutter,
  lineNumbers,
  highlightWhitespace,
} from "@codemirror/view";
import type { Range } from "@codemirror/state";
import type { GitDiffRow } from "../../lib/gitDiff";
import { gitDiffPane } from "../../lib/gitDiffPane";
import { CodeEditor } from "../file-reader/CodeEditor";

class Gap extends WidgetType {
  readonly count: number;
  readonly label?: string;
  readonly height?: number;
  constructor(count: number, label?: string, height?: number) {
    super();
    this.count = count;
    this.label = label;
    this.height = height;
  }
  eq(other: Gap) {
    return (
      this.count === other.count &&
      this.label === other.label &&
      this.height === other.height
    );
  }
  toDOM() {
    const element = document.createElement("div");
    element.className = this.label ? "diff-code-hunk" : "diff-code-spacer";
    element.style.height = this.height
      ? `${this.height}px`
      : `calc(var(--font-size-code) * var(--line-height-code) * ${this.count})`;
    element.textContent = this.label ?? "";
    element.setAttribute("aria-hidden", "true");
    return element;
  }
}
class ChangeMarker extends GutterMarker {
  readonly symbol: string;
  constructor(symbol: string) {
    super();
    this.symbol = symbol;
  }
  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.symbol;
    return span;
  }
}
const minus = new ChangeMarker("−"),
  plus = new ChangeMarker("+");
const paneTheme = EditorView.theme({
  ".cm-content": { padding: "0" },
  ".cm-line": { padding: "0 12px" },
  ".cm-gutters": { borderRight: "none", backgroundColor: "var(--color-bg)" },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "42px",
    padding: "0 6px 0 4px",
  },
  ".diff-code-markers .cm-gutterElement": {
    width: "16px",
    padding: "0 3px",
    textAlign: "center",
  },
  ".cm-scroller::-webkit-scrollbar": { width: "0", height: "10px" },
});
export function DiffCodePane({
  rows,
  side,
  path,
  label,
  onViewReady,
  wrap = false,
  whitespace = false,
  rowHeights,
}: {
  rows: GitDiffRow[];
  side: "left" | "right";
  path: string;
  label: string;
  onViewReady: (view: EditorView | null) => void;
  wrap?: boolean;
  whitespace?: boolean;
  rowHeights?: readonly number[];
}) {
  const model = useMemo(() => gitDiffPane(rows, side), [rows, side]);
  const extensions = useMemo(() => {
    const decorations: Range<Decoration>[] = [];
    for (const line of model.lines)
      if (line.changed || rowHeights)
        decorations.push(
          Decoration.line({
            class: line.changed
              ? side === "left"
                ? "diff-code-removed"
                : "diff-code-added"
              : "",
            attributes: rowHeights
              ? { style: `min-height: ${rowHeights[line.row]}px` }
              : undefined,
          }).range(line.from),
        );
    for (const gap of model.gaps) {
      const before = model.lines[gap.before];
      decorations.push(
        Decoration.widget({
          widget: new Gap(
            gap.count,
            gap.label,
            rowHeights
              ?.slice(gap.row, gap.row + gap.count)
              .reduce((sum, height) => sum + height, 0),
          ),
          block: true,
          side: before ? -1 : 1,
        }).range(before?.from ?? model.content.length),
      );
    }
    return [
      paneTheme,
      whitespace ? highlightWhitespace() : [],
      lineNumbers({
        formatNumber: (number) => String(model.lines[number - 1]?.number ?? ""),
      }),
      gutter({
        class: "diff-code-markers",
        lineMarker: (view, line) =>
          model.lines[view.state.doc.lineAt(line.from).number - 1]?.changed
            ? side === "left"
              ? minus
              : plus
            : null,
      }),
      EditorView.decorations.of(Decoration.set(decorations, true)),
    ];
  }, [model, side, rowHeights, whitespace]);
  return (
    <div
      className="diff-code-pane flex min-h-0 min-w-0 flex-1 overflow-hidden"
      data-empty={model.lines.length === 0 || undefined}
    >
      <CodeEditor
        file={{ path, content: model.content }}
        ariaLabel={`${label}: ${path}`}
        wrap={wrap}
        extensions={extensions}
        onViewReady={onViewReady}
      />
    </div>
  );
}
