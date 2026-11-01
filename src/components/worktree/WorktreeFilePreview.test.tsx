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
    "false",
  );
  const button = (text: string) =>
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === text,
    )!;
  await act(async () => button("common.edit").click());
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
    "false",
  );
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
