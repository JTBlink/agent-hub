// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorktreeEditorMenu } from "./WorktreeEditorMenu";
import {
  WorkspaceFilesContext,
  type WorkspaceFiles,
} from "../../hooks/useWorkspaceFiles";
import { WorktreePreviewsContext } from "../../hooks/worktreePreviewsContext";
import {
  useWorktreeDocument,
  discardWorktreeDocument,
} from "../../hooks/useWorktreeDocument";
import {
  readWorktreeFile,
  writeWorktreeFile,
  revealWorktreeEntry,
} from "../../lib/worktreeApi";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("../../lib/worktreeApi", () => ({
  readWorktreeFile: vi.fn(),
  writeWorktreeFile: vi.fn(),
  revealWorktreeEntry: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let host: HTMLDivElement;
let root: Root;
let projectId: string;
let sequence = 0;
const worktreePath = "~/projects/demo";
const path = "src/example.ts";
const closePreview = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.mocked(readWorktreeFile).mockResolvedValue("original");
  vi.mocked(writeWorktreeFile).mockResolvedValue();
  closePreview.mockReturnValue(true);
  projectId = `menu-${++sequence}`;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () =>
    discardWorktreeDocument(JSON.stringify([projectId, worktreePath, path])),
  );
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function Harness({ preview = false }: { preview?: boolean }) {
  const scope = JSON.stringify([projectId, worktreePath]);
  const [files, setFiles] = useState<WorkspaceFiles>({
    [scope]: { path, shown: true },
  });
  const document = useWorktreeDocument(projectId, worktreePath, path);
  return (
    <WorkspaceFilesContext.Provider
      value={{ files, setFiles, setCheckout: vi.fn() }}
    >
      <WorktreePreviewsContext.Provider
        value={{
          tabs: [
            {
              scope,
              path: "index.html",
              document: {
                id: "preview",
                kind: "html",
                title: "index.html",
                content: "",
                revision: "1",
                url: "http://localhost/preview",
              },
            },
          ],
          selected: null,
          select: vi.fn(),
          open: vi.fn(),
          close: closePreview,
          registerClose: vi.fn(),
        }}
      >
        <button onClick={() => document.change("draft")}>Edit</button>
        <output>{document.draft}</output>
        {files[scope] && <span data-source>Source open</span>}
        <WorktreeEditorMenu
          projectId={projectId}
          worktreePath={worktreePath}
          path={preview ? "index.html" : path}
          previewId={preview ? "preview" : undefined}
        >
          <button data-editor>Editor</button>
        </WorktreeEditorMenu>
      </WorktreePreviewsContext.Provider>
    </WorkspaceFilesContext.Provider>
  );
}
async function open() {
  await act(async () =>
    host
      .querySelector("[data-editor]")!
      .dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      ),
  );
}
const item = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (button) => button.textContent?.startsWith(label),
  )!;
async function choose(label: string) {
  await act(async () => item(label).click());
}
async function edit() {
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button")!.click(),
  );
}
async function dialogAction(label: string) {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[role="alertdialog"] button',
    ),
  ].find((button) => button.textContent === label)!;
  await act(async () => button.click());
}

it("opens with the keyboard, copies paths, reveals the file and disables clean save/revert without extra reads", async () => {
  await act(async () => root.render(<Harness />));
  const target = host.querySelector<HTMLButtonElement>("[data-editor]")!;
  await act(async () =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }),
    ),
  );
  expect(item("common.save").disabled).toBe(true);
  expect(item("worktree.revertFile").disabled).toBe(true);
  expect(readWorktreeFile).toHaveBeenCalledTimes(1);
  await choose("fileTree.copyPath");
  expect(writeText).toHaveBeenCalledWith("~/projects/demo/src/example.ts");
  await open();
  await choose("fileTree.copyRelativePath");
  expect(writeText).toHaveBeenLastCalledWith(path);
  await open();
  await choose("fileTree.reveal");
  expect(revealWorktreeEntry).toHaveBeenCalledWith(
    projectId,
    worktreePath,
    path,
  );
  await open();
  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(target);
});

it("keeps a draft and every editor open after cancel or a failed save when closing all", async () => {
  await act(async () => root.render(<Harness />));
  await edit();
  await open();
  await choose("worktree.closeAllEditors");
  expect(closePreview).not.toHaveBeenCalled();
  await dialogAction("common.cancel");
  expect(host.querySelector("output")!.textContent).toBe("draft");
  await open();
  await choose("worktree.closeAllEditors");
  vi.mocked(writeWorktreeFile).mockRejectedValueOnce(new Error("Conflict"));
  await dialogAction("common.save");
  expect(document.querySelector('[role="alertdialog"]')!.textContent).toContain(
    "worktree.saveBeforeCloseFailed",
  );
  expect(host.querySelector("[data-source]")).not.toBeNull();
  expect(closePreview).not.toHaveBeenCalled();
  await dialogAction("worktree.dontSave");
  expect(host.querySelector("output")!.textContent).toBe("original");
  expect(host.querySelector("[data-source]")).toBeNull();
  expect(closePreview).toHaveBeenCalledWith("preview");
});

it("saves against the original revision and confirms revert while preserving the draft on read failure", async () => {
  await act(async () => root.render(<Harness />));
  await edit();
  await open();
  await choose("common.save");
  expect(writeWorktreeFile).toHaveBeenCalledWith(
    projectId,
    worktreePath,
    path,
    "original",
    "draft",
  );
  // A second edit makes the file dirty again.
  vi.mocked(readWorktreeFile).mockResolvedValueOnce("disk update");
  await act(async () => window.dispatchEvent(new Event("focus")));
  await edit();
  await open();
  await choose("worktree.revertFile");
  await dialogAction("common.cancel");
  expect(host.querySelector("output")!.textContent).toBe("draft");
  await open();
  await choose("worktree.revertFile");
  vi.mocked(readWorktreeFile).mockRejectedValueOnce(new Error("Unavailable"));
  await dialogAction("worktree.revertFile");
  expect(host.querySelector("output")!.textContent).toBe("draft");
  vi.mocked(readWorktreeFile).mockResolvedValueOnce("disk update");
  await dialogAction("worktree.revertFile");
  expect(host.querySelector("output")!.textContent).toBe("disk update");
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
});

it("keeps the current preview when closing other editors", async () => {
  await act(async () => root.render(<Harness preview />));
  await edit();
  await open();
  expect(item("common.save")).toBeUndefined();
  await choose("worktree.closeOtherEditors");
  await dialogAction("worktree.dontSave");
  expect(closePreview).not.toHaveBeenCalled();
  expect(host.querySelector("[data-source]")).toBeNull();
});

it("stops bulk close at a preview guard and keeps the clean source editor open", async () => {
  await act(async () => root.render(<Harness />));
  closePreview.mockReturnValue(false);
  await open();
  await choose("worktree.closeAllEditors");
  expect(closePreview).toHaveBeenCalledWith("preview");
  expect(host.querySelector("[data-source]")).not.toBeNull();
});
