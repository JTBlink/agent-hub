import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import {
  Annotation,
  Compartment,
  EditorState,
  Transaction,
  Text,
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
import type { ReaderFile, ReaderLocation } from "./types";

const externalChange = Annotation.define<boolean>();

interface CodeEditorProps {
  file: ReaderFile;
  location?: ReaderLocation;
  wrap: boolean;
  maxLength?: number;
  onChange?: (content: string) => void;
  extensions?: Extension;
  ariaLabel?: string;
  onViewReady?: (view: EditorView | null) => void;
}

function contentConfiguration({
  file,
  wrap,
  maxLength,
  onChange,
  ariaLabel,
}: CodeEditorProps): Extension[] {
  return [
    EditorState.readOnly.of(!onChange),
    EditorState.lineSeparator.of(file.content.includes("\r\n") ? "\r\n" : "\n"),
    EditorView.editable.of(!!onChange),
    EditorView.contentAttributes.of({
      "aria-label": ariaLabel ?? file.path,
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
  location,
  wrap,
  maxLength,
  onChange,
  extensions,
  ariaLabel,
  onViewReady,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const configuration = useRef(new Compartment());
  const language = useRef(new Compartment());
  const positioned = useRef<ReaderLocation | undefined>(undefined);
  const features = useRef(new Compartment());
  const viewCallback = useRef(onViewReady);
  useLayoutEffect(() => {
    viewCallback.current = onViewReady;
  }, [onViewReady]);

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
        features.current.of([]),
      ],
    });
    view.current = editor;
    viewCallback.current?.(editor);
    return () => {
      viewCallback.current?.(null);
      view.current = null;
      editor.destroy();
    };
  }, []);

  useLayoutEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const changed = editor.state.sliceDoc() !== file.content;
    editor.dispatch({
      effects: [
        configuration.current.reconfigure(
          contentConfiguration({ file, wrap, maxLength, onChange, ariaLabel }),
        ),
        features.current.reconfigure(extensions ?? []),
      ],
      ...(changed
        ? {
            changes: {
              from: 0,
              to: editor.state.doc.length,
              insert: Text.of(
                file.content.split(
                  file.content.includes("\r\n") ? "\r\n" : "\n",
                ),
              ),
            },
            annotations: [
              externalChange.of(true),
              Transaction.addToHistory.of(false),
            ],
          }
        : {}),
    });
  }, [file, wrap, maxLength, onChange, extensions, ariaLabel]);

  useLayoutEffect(() => {
    const editor = view.current;
    if (!editor || !location || positioned.current === location) return;
    positioned.current = location;
    const line = editor.state.doc.line(
      Math.max(1, Math.min(location.line, editor.state.doc.lines)),
    );
    const from =
      line.from + Math.max(0, Math.min(location.column - 1, line.length));
    const to =
      line.from + Math.max(0, Math.min(location.endColumn - 1, line.length));
    editor.dispatch({
      selection: { anchor: from, head: Math.max(from, to) },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    editor.focus();
  }, [location, file.content]);

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
