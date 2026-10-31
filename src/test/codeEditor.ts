import { EditorView } from "@codemirror/view";

/** Exercise real editor transactions instead of mocking the text surface. */
export function codeEditor(root: ParentNode = document): EditorView {
  const node = root.querySelector<HTMLElement>(".cm-editor");
  const editor = node && EditorView.findFromDOM(node);
  if (!editor) throw new Error("Code editor is not mounted");
  return editor;
}

/** jsdom has no layout engine; real geometry is checked in the browser preview. */
export function installCodeEditorGeometry() {
  Object.defineProperties(Range.prototype, {
    getClientRects: { configurable: true, value: () => [] },
    getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
  });
}
