// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WorktreeFilePreview } from "./WorktreeFilePreview";
import { readWorktreeFile, writeWorktreeFile } from "../../lib/worktreeApi";
import { codeEditor, installCodeEditorGeometry } from "../../test/codeEditor";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("../../lib/worktreeApi", () => ({
  readWorktreeFile: vi.fn(),
  writeWorktreeFile: vi.fn(),
}));

it("edits highlighted worktree code, preserves a failed-save draft across remounts, and saves against the original text", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  installCodeEditorGeometry();
  vi.mocked(readWorktreeFile).mockResolvedValue("fn main() {}\n");
  vi.mocked(writeWorktreeFile).mockRejectedValueOnce(
    new Error("File changed on disk"),
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = () =>
    root.render(
      <WorktreeFilePreview
        projectId="edit-demo"
        worktreePath="~/projects/demo"
        path="src/main.rs"
      />,
    );
  await act(async () => render());
  expect(codeEditor(host).contentDOM.getAttribute("contenteditable")).toBe(
    "true",
  );
  const button = (text: string) =>
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === text,
    )!;
  expect(button("common.edit")).toBeUndefined();
  await act(async () => {
    const editor = codeEditor(host);
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: "fn updated() {}\n",
      },
    });
  });
  await act(async () => button("common.save").click());
  expect(host.textContent).toContain("File changed on disk");
  expect(codeEditor(host).state.sliceDoc()).toBe("fn updated() {}\n");
  await act(async () => root.render(null));
  await act(async () => render());
  expect(codeEditor(host).state.sliceDoc()).toBe("fn updated() {}\n");
  expect(readWorktreeFile).toHaveBeenCalledTimes(1);
  vi.mocked(writeWorktreeFile).mockResolvedValueOnce();
  await act(async () => button("common.save").click());
  expect(writeWorktreeFile).toHaveBeenLastCalledWith(
    "edit-demo",
    "~/projects/demo",
    "src/main.rs",
    "fn main() {}\n",
    "fn updated() {}\n",
  );
  expect(host.textContent).not.toContain("worktree.unsaved");
  expect(codeEditor(host).contentDOM.getAttribute("contenteditable")).toBe(
    "true",
  );
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it.each(["cancel", "discard", "save", "failure"])(
  "handles %s when closing an unsaved file",
  async (action) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    installCodeEditorGeometry();
    vi.mocked(readWorktreeFile).mockResolvedValue("original");
    if (action === "failure")
      vi.mocked(writeWorktreeFile).mockRejectedValue(new Error("Conflict"));
    else vi.mocked(writeWorktreeFile).mockResolvedValue();
    const { WorktreeFileCloseButton } =
      await import("./WorktreeFileCloseButton");
    const { discardWorktreeDocument } =
      await import("../../hooks/useWorktreeDocument");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onClose = vi.fn();
    const props = {
      projectId: `close-${action}`,
      worktreePath: "~/projects/demo",
      path: "demo.ts",
    };
    await act(async () =>
      root.render(
        <>
          <WorktreeFilePreview {...props} />
          <WorktreeFileCloseButton {...props} onClose={onClose} />
        </>,
      ),
    );
    await act(async () =>
      codeEditor(host).dispatch({
        changes: { from: 0, to: 8, insert: "changed" },
      }),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="fileReader.closeFile"]',
        )!
        .click(),
    );
    expect(onClose).not.toHaveBeenCalled();
    const dialog = host.querySelector('[role="alertdialog"]')!;
    expect(dialog).not.toBeNull();
    const label =
      action === "cancel"
        ? "common.cancel"
        : action === "discard"
          ? "worktree.dontSave"
          : "common.save";
    await act(async () =>
      [...dialog.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === label)!
        .click(),
    );
    if (action === "cancel" || action === "failure") {
      expect(onClose).not.toHaveBeenCalled();
      expect(codeEditor(host).state.sliceDoc()).toBe("changed");
    } else expect(onClose).toHaveBeenCalledOnce();
    if (action === "failure")
      expect(dialog.textContent).toContain("worktree.saveBeforeCloseFailed");
    if (action === "discard") {
      expect(writeWorktreeFile).not.toHaveBeenCalled();
      expect(codeEditor(host).state.sliceDoc()).toBe("original");
    }
    if (action === "save")
      expect(writeWorktreeFile).toHaveBeenCalledWith(
        props.projectId,
        props.worktreePath,
        props.path,
        "original",
        "changed",
      );
    await act(async () =>
      discardWorktreeDocument(
        JSON.stringify([props.projectId, props.worktreePath, props.path]),
      ),
    );
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  },
);

it("opens Markdown directly in the editable source view", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  installCodeEditorGeometry();
  vi.mocked(readWorktreeFile).mockResolvedValue("# Demo\n");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <WorktreeFilePreview
        projectId="markdown-editor"
        worktreePath="~/projects/demo"
        path="README.md"
      />,
    ),
  );
  expect(codeEditor(host).state.sliceDoc()).toBe("# Demo\n");
  expect(codeEditor(host).state.readOnly).toBe(false);
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("moves file controls into the shared toolbar and offers preview only for Markdown", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  installCodeEditorGeometry();
  vi.mocked(readWorktreeFile).mockResolvedValue("# Toolbar example");
  vi.mocked(writeWorktreeFile).mockResolvedValue();
  const host = document.createElement("div");
  const toolbar = document.createElement("div");
  document.body.append(toolbar, host);
  const root = createRoot(host);
  const render = (path: string) =>
    root.render(
      <WorktreeFilePreview
        key={path}
        projectId="toolbar-demo"
        worktreePath="~/projects/demo"
        path={path}
        toolbarContainer={toolbar}
      />,
    );
  await act(async () => render("README.md"));
  expect(host.querySelector('[aria-label="settings.refresh"]')).toBeNull();
  expect(
    host.querySelector('[title="README.md"][aria-label="README.md"]'),
  ).toBeNull();
  expect(
    toolbar.querySelector('[aria-label="install.scan.openInVscode"]'),
  ).toBeNull();
  expect(
    toolbar.querySelector('[aria-label="settings.refresh"]'),
  ).not.toBeNull();
  expect(
    toolbar.querySelector('[aria-label="fileReader.preview"]'),
  ).not.toBeNull();
  await act(async () =>
    toolbar
      .querySelector<HTMLButtonElement>('[aria-label="fileReader.preview"]')!
      .click(),
  );
  expect(host.querySelector("article h1")?.textContent).toBe("Toolbar example");
  await act(async () =>
    toolbar
      .querySelector<HTMLButtonElement>('[aria-label="fileReader.source"]')!
      .click(),
  );
  await act(async () => {
    const editor = codeEditor(host);
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: "# Changed" },
    });
  });
  expect(toolbar.textContent).toContain("worktree.unsaved");
  const save = toolbar.querySelector<HTMLButtonElement>(
    '[aria-label="common.save"]',
  )!;
  expect(save.disabled).toBe(false);
  await act(async () => save.click());
  expect(writeWorktreeFile).toHaveBeenLastCalledWith(
    "toolbar-demo",
    "~/projects/demo",
    "README.md",
    "# Toolbar example",
    "# Changed",
  );
  expect(save.disabled).toBe(true);
  await act(async () => render("example.ts"));
  expect(toolbar.querySelector('[aria-label="fileReader.preview"]')).toBeNull();
  expect(
    toolbar.querySelector('[aria-label="fileReader.wrap"]'),
  ).not.toBeNull();
  await act(async () => root.unmount());
  expect(toolbar.children).toHaveLength(0);
  host.remove();
  toolbar.remove();
  vi.unstubAllGlobals();
});
