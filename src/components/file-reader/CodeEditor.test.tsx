// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { CodeEditor } from "./CodeEditor";
import { codeEditor, installCodeEditorGeometry } from "../../test/codeEditor";
import i18n from "../../i18n";

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

it.each([
  ["parser.cpp", "int main() { return 0; }", "int"],
  ["change.diff", "+added line\n-removed line\n", "+added line"],
  ["service.go", "package main\nfunc main() {}", "package"],
])(
  "highlights programmer files using shared language definitions: %s",
  async (path, content, token) => {
    await act(async () =>
      root.render(<CodeEditor file={{ path, content }} wrap={false} />),
    );
    await vi.waitFor(() =>
      expect(
        [...host.querySelectorAll(".cm-line span")].some((node) =>
          node.textContent?.includes(token),
        ),
      ).toBe(true),
    );
    expect(codeEditor(host).state.sliceDoc()).toBe(content);
  },
);

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

it("locates search results by UTF-16 columns without resetting a later editor selection", async () => {
  const location = { line: 2, column: 4, endColumn: 10 };
  const file = { path: "demo.ts", content: "first\n😀 needle tail\nlast" };
  await act(async () =>
    root.render(<CodeEditor file={file} location={location} wrap={false} />),
  );
  const editor = codeEditor(host);
  expect(
    editor.state.sliceDoc(
      editor.state.selection.main.from,
      editor.state.selection.main.to,
    ),
  ).toBe("needle");
  editor.dispatch({ selection: { anchor: 0 } });
  await act(async () =>
    root.render(
      <CodeEditor file={{ ...file }} location={location} wrap={false} />,
    ),
  );
  expect(editor.state.selection.main.from).toBe(0);
  await act(async () =>
    root.render(
      <CodeEditor file={file} location={{ ...location }} wrap={false} />,
    ),
  );
  expect(
    editor.state.sliceDoc(
      editor.state.selection.main.from,
      editor.state.selection.main.to,
    ),
  ).toBe("needle");
});

const press = (
  target: Element,
  key: string,
  options: KeyboardEventInit = {},
) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
};

async function query(value: string) {
  const input = host.querySelector<HTMLInputElement>(".cm-file-search input")!;
  await act(async () => {
    input.value = value;
    input.setSelectionRange(value.length, value.length);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(input.selectionStart).toBe(value.length);
  expect(input.selectionEnd).toBe(value.length);
  return input;
}

it("finds within a read-only file, navigates matches and restores editor focus on Escape", async () => {
  const file = { path: "demo.txt", content: "needle\n😀 needle\nother" };
  await act(async () => root.render(<CodeEditor file={file} wrap={false} />));
  const editor = codeEditor(host);
  editor.focus();
  await act(async () => {
    expect(
      press(editor.contentDOM, "f", { ctrlKey: true }).defaultPrevented,
    ).toBe(true);
  });
  const input = await query("needle");
  expect(host.querySelector(".cm-panels-top .cm-file-search")).not.toBeNull();
  expect(document.activeElement).toBe(input);
  expect(host.querySelector('[role="status"]')?.textContent).toBe("1 / 2");
  await act(async () => press(input, "Enter"));
  expect(editor.state.selection.main.from).toBe(
    file.content.lastIndexOf("needle"),
  );
  expect(host.querySelector('[role="status"]')?.textContent).toBe("2 / 2");
  await act(async () => press(input, "Enter", { shiftKey: true }));
  expect(editor.state.selection.main.from).toBe(0);
  await act(async () => press(input, "f", { ctrlKey: true }));
  expect(document.activeElement).toBe(input);
  expect(host.querySelectorAll(".cm-file-search")).toHaveLength(1);
  await act(async () => press(input, "Escape"));
  expect(host.querySelector(".cm-file-search")).toBeNull();
  expect(document.activeElement).toBe(editor.contentDOM);
  expect(editor.state.sliceDoc()).toBe(file.content);
});

it("applies case, word and regex options and recomputes counts when file content changes", async () => {
  const file = { path: "demo.txt", content: "Cat cat cats\ncat" };
  await act(async () => root.render(<CodeEditor file={file} wrap={false} />));
  const editor = codeEditor(host);
  editor.focus();
  await act(async () => press(editor.contentDOM, "f", { ctrlKey: true }));
  await query("cat");
  const count = () => host.querySelector('[role="status"]')?.textContent;
  const toggle = async (label: string) =>
    act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          `button[aria-label="${i18n.t(label)}"]`,
        )!
        .click();
    });
  expect(count()).toBe("1 / 4");
  await toggle("workspaceSearch.matchCase");
  expect(count()).toBe("1 / 3");
  await toggle("workspaceSearch.wholeWord");
  expect(count()).toBe("1 / 2");
  await toggle("workspaceSearch.regex");
  const input = await query("[");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(count()).toBe(i18n.t("fileReader.invalidRegex"));
  await query("c.t");
  expect(count()).toContain("/ 2");
  await act(async () =>
    root.render(<CodeEditor file={{ ...file, content: "cat" }} wrap />),
  );
  expect(count()).toContain("/ 1");
  await query("missing");
  expect(count()).toBe("0 / 0");
});

it("searches only the focused editor and leaves workspace search untouched", async () => {
  await act(async () =>
    root.render(
      <>
        <CodeEditor
          file={{ path: "first.txt", content: "first" }}
          wrap={false}
        />
        <CodeEditor
          file={{ path: "second.txt", content: "second" }}
          wrap={false}
        />
      </>,
    ),
  );
  const editors = host.querySelectorAll<HTMLElement>(".cm-content");
  editors[1].focus();
  await act(async () => press(editors[1], "f", { ctrlKey: true }));
  expect(host.querySelectorAll(".cm-file-search")).toHaveLength(1);
  expect(
    host.querySelectorAll(".cm-editor")[1].contains(document.activeElement),
  ).toBe(true);
  await act(async () => press(document.activeElement!, "Escape"));
  const workspace = press(editors[1], "F", { ctrlKey: true, shiftKey: true });
  expect(workspace.defaultPrevented).toBe(false);
  expect(host.querySelector(".cm-file-search")).toBeNull();
});
