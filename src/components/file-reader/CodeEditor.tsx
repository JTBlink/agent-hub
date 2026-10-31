import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import {
  Annotation,
  Compartment,
  EditorState,
  Transaction,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, syntaxHighlighting } from "@codemirror/language";
import { codeHighlightStyle, codeTheme } from "./codeTheme";
import { languageForPath } from "./codeLanguages";
import type { ReaderFile } from "./types";

const externalChange = Annotation.define<boolean>();

interface CodeEditorProps {
  file: ReaderFile;
  wrap: boolean;
  maxLength?: number;
  onChange?: (content: string) => void;
}

function contentConfiguration({
  file,
  wrap,
  maxLength,
  onChange,
}: CodeEditorProps): Extension[] {
  return [
    EditorState.readOnly.of(!onChange),
    EditorState.lineSeparator.of(file.content.includes("\r\n") ? "\r\n" : "\n"),
    EditorView.editable.of(!!onChange),
    EditorView.contentAttributes.of({
      "aria-label": file.path,
      "aria-readonly": String(!onChange),
      role: "textbox",
      "aria-multiline": "true",
      tabindex: "0",
      spellcheck: "false",
      autocapitalize: "off",
      autocorrect: "off",
    }),
    wrap ? EditorView.lineWrapping : [],
    EditorState.changeFilter.of(
      (transaction) =>
        !transaction.docChanged ||
        !!transaction.annotation(externalChange) ||
        (!!onChange &&
          (maxLength === undefined ||
            transaction.newDoc.length <= maxLength ||
            transaction.newDoc.length < transaction.startState.doc.length)),
    ),
    EditorView.updateListener.of((update) => {
      if (
        update.transactions.some(
          (transaction) =>
            transaction.docChanged && !transaction.annotation(externalChange),
        )
      )
        onChange?.(update.state.sliceDoc());
    }),
  ];
}

/** Controlled text surface; the host remains the authority for draft content. */
export function CodeEditor({
  file,
  wrap,
  maxLength,
  onChange,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const configuration = useRef(new Compartment());
  const language = useRef(new Compartment());

  useLayoutEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        lineNumbers(),
        highlightSpecialChars(),
        drawSelection(),
        bracketMatching(),
        syntaxHighlighting(codeHighlightStyle),
        codeTheme,
        configuration.current.of([]),
        language.current.of([]),
      ],
    });
    view.current = editor;
    return () => {
      view.current = null;
      editor.destroy();
    };
  }, []);

  useLayoutEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch({
      effects: configuration.current.reconfigure(
        contentConfiguration({ file, wrap, maxLength, onChange }),
      ),
    });
    if (editor.state.sliceDoc() !== file.content)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: file.content },
        annotations: [
          externalChange.of(true),
          Transaction.addToHistory.of(false),
        ],
      });
  }, [file, wrap, maxLength, onChange]);

  useCodeLanguage(view, language, file.path);

  return (
    <div
      ref={host}
      className="min-h-0 min-w-0 flex-1 overflow-hidden font-mono"
    />
  );
}

function useCodeLanguage(
  view: RefObject<EditorView | null>,
  language: RefObject<Compartment>,
  path: string,
) {
  useEffect(() => {
    let cancelled = false;
    const editor = view.current;
    const description = languageForPath(path);
    editor?.dispatch({ effects: language.current.reconfigure([]) });
    if (description)
      void description
        .load()
        .then((support) => {
          if (!cancelled)
            editor?.dispatch({
              effects: language.current.reconfigure(support),
            });
        })
        .catch(() => {
          /* Plain text remains readable if a language chunk cannot load. */
        });
    return () => {
      cancelled = true;
    };
  }, [path, view, language]);
}
