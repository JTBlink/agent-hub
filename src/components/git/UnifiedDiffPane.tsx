import { useMemo } from "react";
import type { Range } from "@codemirror/state";
import { Decoration, EditorView, highlightWhitespace } from "@codemirror/view";
import { CodeEditor } from "../file-reader/CodeEditor";

export function UnifiedDiffPane({
  patch,
  path,
  wrap,
  whitespace,
  onViewReady,
}: {
  patch: string;
  path: string;
  wrap: boolean;
  whitespace: boolean;
  onViewReady: (view: EditorView | null) => void;
}) {
  const extensions = useMemo(() => {
    let offset = 0;
    const decorations: Range<Decoration>[] = [];
    for (const line of patch.split(/\r?\n/)) {
      const from = offset;
      offset += line.length + 1;
      if (/^[+-]/.test(line) && !/^(---|\+\+\+)/.test(line))
        decorations.push(
          Decoration.line({
            class: line[0] === "+" ? "diff-code-added" : "diff-code-removed",
          }).range(from),
        );
    }
    return [
      EditorView.decorations.of(Decoration.set(decorations)),
      whitespace ? highlightWhitespace() : [],
    ];
  }, [patch, whitespace]);
  return (
    <div className="diff-code-pane flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <CodeEditor
        file={{ path: `${path}.diff`, content: patch }}
        wrap={wrap}
        extensions={extensions}
        onViewReady={onViewReady}
      />
    </div>
  );
}
