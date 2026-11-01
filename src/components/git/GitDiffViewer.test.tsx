// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { GitDiffViewer } from "./GitDiffViewer";
import { installCodeEditorGeometry } from "../../test/codeEditor";
const t = (key: string) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
let host: HTMLDivElement, root: Root;
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
const patch = "@@ -10,4 +10,3 @@\n context\n-old one\n-old two\n+new\n end\n";
const editors = () =>
  [...host.querySelectorAll<HTMLElement>(".cm-editor")].map((node) =>
    EditorView.findFromDOM(node)!,
  );
it("selects and copies only source text from one side, excluding line numbers, gaps and the other version", async () => {
  await act(async () =>
    root.render(<GitDiffViewer patch={patch} staged={false} path="demo.ts" />),
  );
  const [left, right] = editors();
  expect(left.state.sliceDoc()).toBe("context\nold one\nold two\nend");
  expect(right.state.sliceDoc()).toBe("context\nnew\nend");
  expect(host.querySelector(".cm-lineNumbers")?.textContent).toContain("10");
  expect(right.state.readOnly).toBe(true);
  await act(async () => {
    left.focus();
    left.dispatch({ selection: { anchor: 0, head: left.state.doc.length } });
  });
  const copied: Record<string, string> = {};
  const event = new Event("copy", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      clearData: () => {},
      setData: (type: string, value: string) => {
        copied[type] = value;
      },
    },
  });
  left.contentDOM.dispatchEvent(event);
  expect(copied["text/plain"]).toBe("context\nold one\nold two\nend");
  expect(copied["text/plain"]).not.toContain("new");
  expect(right.state.selection.main.empty).toBe(true);
  await act(async () => {
    right.scrollDOM.scrollTop = 100;
    right.scrollDOM.dispatchEvent(new Event("scroll"));
  });
  expect(left.scrollDOM.scrollTop).toBe(100);
  await act(async () => {
    left.scrollDOM.scrollTop = 40;
    left.scrollDOM.dispatchEvent(new Event("scroll"));
  });
  expect(right.scrollDOM.scrollTop).toBe(40);
});
it("updates decorations atomically when opening a shorter patch and supports empty versions", async () => {
  await act(async () =>
    root.render(<GitDiffViewer patch={patch} staged path="demo.ts" />),
  );
  await act(async () =>
    root.render(
      <GitDiffViewer
        patch={"@@ -0,0 +1 @@\n+const added = true;\n"}
        staged
        path="new.ts"
      />,
    ),
  );
  const [left, right] = editors();
  expect(left.state.sliceDoc()).toBe("");
  expect(right.state.sliceDoc()).toBe("const added = true;");
  expect(host.querySelectorAll(".diff-code-spacer").length).toBeGreaterThan(0);
  expect(
    host.querySelector('[role="scrollbar"]')?.getAttribute("aria-controls"),
  ).toBe(right.scrollDOM.id);
});

it("navigates change blocks in both layouts and applies the toolbar display controls", async () => {
  const onOpenFile = vi.fn();
  const changes =
    "@@ -1,5 +1,5 @@\n start\n-old one\n+new one\n keep\n-old two\n+new two\n end\n";
  await act(async () =>
    root.render(
      <GitDiffViewer
        patch={changes}
        staged={false}
        path="demo.ts"
        onOpenFile={onOpenFile}
      />,
    ),
  );
  const button = (label: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const click = (label: string) => act(async () => button(label).click());
  await click("git.nextChange");
  expect(
    editors()[1].state.doc.lineAt(editors()[1].state.selection.main.head).text,
  ).toBe("new one");
  await click("git.nextChange");
  expect(
    editors()[1].state.doc.lineAt(editors()[1].state.selection.main.head).text,
  ).toBe("new two");
  await click("git.nextChange");
  expect(
    editors()[1].state.doc.lineAt(editors()[1].state.selection.main.head).text,
  ).toBe("new one");
  await click("git.previousChange");
  expect(
    editors()[1].state.doc.lineAt(editors()[1].state.selection.main.head).text,
  ).toBe("new two");
  await click("fileReader.wrap");
  expect(
    editors().every((view) =>
      view.contentDOM.classList.contains("cm-lineWrapping"),
    ),
  ).toBe(true);
  await click("git.showWhitespace");
  expect(host.querySelector(".cm-highlightSpace")).not.toBeNull();
  await click("git.changeOverview");
  expect(host.querySelector('[role="scrollbar"]')).toBeNull();
  await click("git.changeOverview");
  expect(host.querySelector('[role="scrollbar"]')).not.toBeNull();
  await click("git.split");
  expect(editors()).toHaveLength(1);
  expect(editors()[0].state.sliceDoc()).toBe(changes);
  await click("git.nextChange");
  expect(
    editors()[0].state.doc.lineAt(editors()[0].state.selection.main.head).text,
  ).toBe("-old one");
  await click("git.previousChange");
  expect(
    editors()[0].state.doc.lineAt(editors()[0].state.selection.main.head).text,
  ).toBe("-old two");
  await click("git.file");
  expect(onOpenFile).toHaveBeenCalledOnce();
});

it("navigates a deletion on the original side and disables navigation for a non-text diff", async () => {
  await act(async () =>
    root.render(
      <GitDiffViewer
        patch={"@@ -1,2 +1 @@\n-removed\n context\n"}
        staged={false}
      />,
    ),
  );
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label="git.nextChange"]')!
      .click(),
  );
  expect(editors()[0].hasFocus).toBe(true);
  expect(
    editors()[0].state.doc.lineAt(editors()[0].state.selection.main.head).text,
  ).toBe("removed");
  await act(async () =>
    root.render(<GitDiffViewer patch="Binary files differ" staged={false} />),
  );
  expect(
    host.querySelector<HTMLButtonElement>(
      'button[aria-label="git.nextChange"]',
    )!.disabled,
  ).toBe(true);
  expect(
    host.querySelector<HTMLButtonElement>('button[aria-label="git.file"]')!
      .disabled,
  ).toBe(true);
});

it("keeps unified decorations and navigation valid for CRLF patches", async () => {
  const changes = "@@ -1,2 +1,2 @@\r\n context\r\n-old\r\n+new\r\n";
  await act(async () =>
    root.render(<GitDiffViewer patch={changes} staged={false} />),
  );
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label="git.split"]')!
      .click(),
  );
  expect(editors()).toHaveLength(1);
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label="git.nextChange"]')!
      .click(),
  );
  expect(
    editors()[0].state.doc.lineAt(editors()[0].state.selection.main.head).text,
  ).toBe("-old");
  expect(host.querySelectorAll(".diff-code-removed")).toHaveLength(1);
  expect(host.querySelectorAll(".diff-code-added")).toHaveLength(1);
});
