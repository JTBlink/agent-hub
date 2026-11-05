// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { revealWorktreeEntry } from "../../lib/worktreeApi";
import { GitChanges } from "./GitChanges";
import { GitChangeFileMenu } from "./GitChangeFileMenu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("../../lib/worktreeApi", () => ({ revealWorktreeEntry: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

it("opens file menus in both layouts without selecting, and routes actions to the clicked change group", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onSelect = vi.fn(),
    onOpenFile = vi.fn(),
    onOpenRevision = vi.fn(),
    onStage = vi.fn(),
    onDiscard = vi.fn();
  const file = {
    path: "src/example.ts",
    old_path: "src/previous.ts",
    status: "renamed",
    staged: true,
    unstaged: true,
    conflicted: false,
  };
  const render = (
    staged = false,
    busy = false,
    status = "renamed",
    tree = true,
    head: string | null = "abc123",
  ) =>
    act(async () =>
      root.render(
        <GitChanges
          files={[{ ...file, status }]}
          staged={staged}
          busy={busy}
          batchLimited={false}
          tree={tree}
          onSelect={onSelect}
          onStage={onStage}
          onDiscard={onDiscard}
          renderFile={(file, children) => (
            <GitChangeFileMenu
              projectId="demo"
              root="/workspace/demo"
              head={head}
              file={file}
              staged={staged}
              busy={busy}
              onSelect={onSelect}
              onOpenFile={onOpenFile}
              onOpenRevision={onOpenRevision}
              onStage={onStage}
              onDiscard={onDiscard}
            >
              {children}
            </GitChangeFileMenu>
          )}
        />,
      ),
    );
  const row = () =>
    host.querySelector<HTMLButtonElement>(
      'button[title="src/previous.ts → src/example.ts"]',
    )!;
  const open = () =>
    act(async () => {
      row().dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100,
        }),
      );
    });
  const item = (label: string) =>
    document.querySelector<HTMLButtonElement>(
      `[role="menuitem"][title="${label}"]`,
    )!;
  const choose = async (label: string) => act(async () => item(label).click());
  try {
    await render();
    await open();
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
    expect(onSelect).not.toHaveBeenCalled();
    await choose("git.openChanges");
    expect(onSelect).toHaveBeenLastCalledWith({
      path: file.path,
      staged: false,
    });
    await open();
    await choose("fileTree.open");
    expect(onOpenFile).toHaveBeenCalledWith({ path: file.path, staged: false });
    await open();
    await choose("git.openHead");
    expect(onOpenRevision).toHaveBeenCalledWith({
      sha: "abc123",
      path: file.old_path,
      view: "revision",
    });
    await open();
    await choose("git.stageFile");
    expect(onStage).toHaveBeenLastCalledWith([file.path], true);
    await open();
    await choose("git.discardChanges");
    expect(onDiscard).toHaveBeenCalledExactlyOnceWith([file.path]);
    await open();
    await choose("fileTree.copyRelativePath");
    expect(writeText).toHaveBeenLastCalledWith(file.path);
    await open();
    await choose("fileTree.copyPath");
    expect(writeText).toHaveBeenLastCalledWith(`/workspace/demo/${file.path}`);
    await open();
    await choose("fileTree.reveal");
    expect(revealWorktreeEntry).toHaveBeenCalledWith(
      "demo",
      "/workspace/demo",
      file.path,
    );
    await render(true, false, "modified", false);
    await open();
    expect(item("git.discardChanges")).toBeNull();
    await choose("git.unstageFile");
    expect(onStage).toHaveBeenLastCalledWith([file.path], false);
    await render(false, true, "added");
    await open();
    expect(item("git.stageFile").disabled).toBe(true);
    expect(item("git.discardChanges").disabled).toBe(true);
    expect(item("git.openHead").disabled).toBe(true);
    await act(async () =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(row());
    await render(false, false, "deleted", true, null);
    await act(async () =>
      row().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(item("fileTree.open").disabled).toBe(true);
    expect(item("fileTree.reveal").disabled).toBe(true);
    expect(item("git.openHead").disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
