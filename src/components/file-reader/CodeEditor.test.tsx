// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { CodeEditor } from "./CodeEditor";
import { codeEditor, installCodeEditorGeometry } from "../../test/codeEditor";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  installCodeEditorGeometry();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("highlights Python while keeping read-only text focusable and selectable", async () => {
  const content = 'import os\nprint("<script>example</script>")\n';
  await act(async () =>
    root.render(<CodeEditor file={{ path: "run.PY", content }} wrap={false} />),
  );
  const editor = codeEditor(host);
  await vi.waitFor(() =>
    expect(
      [...host.querySelectorAll(".cm-line span")].some(
        (node) => node.textContent === "import",
      ),
    ).toBe(true),
  );
  expect(editor.state.sliceDoc()).toBe(content);
  expect(editor.contentDOM.getAttribute("aria-label")).toBe("run.PY");
  expect(editor.contentDOM.getAttribute("contenteditable")).toBe("false");
  expect(host.querySelector("script")).toBeNull();
  editor.contentDOM.focus();
  expect(document.activeElement).toBe(editor.contentDOM);
  editor.dispatch({ selection: { anchor: 0, head: 6 } });
  expect(
    editor.state.sliceDoc(
      editor.state.selection.main.from,
      editor.state.selection.main.to,
    ),
  ).toBe("import");
  editor.dispatch({ changes: { from: 0, insert: "cannot edit" } });
  expect(editor.state.sliceDoc()).toBe(content);
});

it("preserves edits and undo across wrapping and callback updates, enforcing the host's length limit", async () => {
  const first = vi.fn();
  const next = vi.fn();
  await act(async () =>
    root.render(
      <CodeEditor
        file={{ path: "config.json", content: "{}" }}
        wrap={false}
        maxLength={4}
        onChange={first}
      />,
    ),
  );
  const editor = codeEditor(host);
  editor.dispatch({ changes: { from: 1, insert: "12" } });
  expect(first).toHaveBeenLastCalledWith("{12}");
  await act(async () =>
    root.render(
      <CodeEditor
        file={{ path: "config.json", content: "{12}" }}
        wrap
        maxLength={4}
        onChange={next}
      />,
    ),
  );
  expect(codeEditor(host)).toBe(editor);
  expect(editor.contentDOM.classList.contains("cm-lineWrapping")).toBe(true);
  editor.dispatch({ changes: { from: 1, insert: "3" } });
  expect(editor.state.sliceDoc()).toBe("{12}");
  expect(next).not.toHaveBeenCalled();
  undo(editor);
  expect(next).toHaveBeenLastCalledWith("{}");
});

it("accepts external content updates without reporting edits and falls back to plain text for unknown files", async () => {
  const change = vi.fn();
  await act(async () =>
    root.render(
      <CodeEditor
        file={{ path: "notes.unknown", content: "before" }}
        wrap={false}
        onChange={change}
      />,
    ),
  );
  await act(async () =>
    root.render(
      <CodeEditor
        file={{ path: "notes.unknown", content: "after\r\n" }}
        wrap={false}
        onChange={change}
      />,
    ),
  );
  const editor = codeEditor(host);
  expect(editor.state.sliceDoc()).toBe("after\r\n");
  expect(change).not.toHaveBeenCalled();
  editor.dispatch({ changes: { from: 0, insert: "!" } });
  expect(change).toHaveBeenLastCalledWith("!after\r\n");
});

it("allows shortening existing content that exceeds a newly applied length limit", async () => {
  const change = vi.fn();
  await act(async () =>
    root.render(
      <CodeEditor
        file={{ path: "notes.txt", content: "too long" }}
        wrap={false}
        maxLength={4}
        onChange={change}
      />,
    ),
  );
  const editor = codeEditor(host);
  editor.dispatch({ changes: { from: 7, to: 8 } });
  expect(change).toHaveBeenLastCalledWith("too lon");
  editor.dispatch({ changes: { from: 0, insert: "more" } });
  expect(editor.state.sliceDoc()).toBe("too lon");
});
