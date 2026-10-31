import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export const codeHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.modifier, tags.operatorKeyword],
    color: "var(--color-brand-violet)",
  },
  {
    tag: [tags.string, tags.regexp, tags.inserted],
    color: "var(--color-brand-teal)",
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.constant(tags.variableName)],
    color: "var(--color-accent-light)",
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.heading,
      tags.link,
    ],
    color: "var(--color-accent-light)",
  },
  {
    tag: [tags.typeName, tags.className, tags.attributeName],
    color: "var(--color-brand-violet)",
  },
  { tag: tags.comment, color: "var(--color-text-muted)", fontStyle: "italic" },
  { tag: tags.invalid, color: "var(--color-danger)" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
]);

export const codeTheme = EditorView.theme({
  "&": {
    colorScheme: "var(--color-scheme)",
    height: "100%",
    color: "var(--color-text-secondary)",
    backgroundColor: "var(--color-bg)",
    fontSize: "12px",
  },
  "&.cm-focused": {
    outline: "1px solid var(--color-accent)",
    outlineOffset: "-1px",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit",
    lineHeight: "24px",
  },
  ".cm-content": { padding: "16px 0", caretColor: "var(--color-text-primary)" },
  ".cm-line": { padding: "0 16px" },
  ".cm-gutters": {
    backgroundColor: "var(--color-bg)",
    color: "var(--color-text-muted)",
    borderRight: "1px solid var(--color-border-subtle)",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px", minWidth: "36px" },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--color-text-primary)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--color-surface-active)" },
  ".cm-matchingBracket": {
    backgroundColor: "var(--color-surface-active)",
    outline: "1px solid var(--color-accent-border)",
  },
});
