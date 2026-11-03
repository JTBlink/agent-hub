// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HerdrWorktreeMenu } from "./HerdrWorktreeMenu";
import { deleteHerdrWorktree } from "../lib/herdrControlApi";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { revealWorktreeEntry } from "../../../lib/worktreeApi";
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../../lib/worktreeApi", () => ({ revealWorktreeEntry: vi.fn() }));
vi.mock("../lib/herdrControlApi", () => ({ deleteHerdrWorktree: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("opens on right click without navigating and retains failed deletion for retry", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onOpen = vi.fn(),
    onDeleted = vi.fn();
  try {
    await act(async () =>
      root.render(
        <HerdrWorktreeMenu
          workspace={{
            label: "topic",
            directory: "/projects/topic",
            branch: "topic",
          }}
          disabled={false}
          onOpen={onOpen}
          deletion={{
            session: "default",
            projectId: "demo",
            path: "/projects/topic",
            workspaceId: "w1",
            disabled: false,
            onDeleted,
          }}
        >
          <button onClick={onOpen}>topic</button>
        </HerdrWorktreeMenu>,
      ),
    );
    const row = host.querySelector("button")!;
    await act(async () => row.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
    await act(async () =>
      row.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100,
        }),
      ),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find((item) => item.textContent === "herdr.deleteWorktree")!
        .click(),
    );
    const confirm = () =>
      [
        ...host.querySelectorAll<HTMLButtonElement>(
          '[role="alertdialog"] button',
        ),
      ].find((b) => b.textContent === "common.delete")!;
    vi.mocked(deleteHerdrWorktree).mockRejectedValueOnce(
      new Error("Local files remain"),
    );
    await act(async () => confirm().click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "Local files remain",
    );
    expect(onDeleted).not.toHaveBeenCalled();
    vi.mocked(deleteHerdrWorktree).mockResolvedValueOnce(undefined);
    await act(async () => confirm().click());
    expect(deleteHerdrWorktree).toHaveBeenLastCalledWith(
      "default",
      "demo",
      "/projects/topic",
      "w1",
    );
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

async function renderMenu(
  workspace: {
    label: string;
    directory: string | null;
    branch?: string | null;
  },
  target: "project" | "worktree" = "project",
  unavailable = false,
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(writeText).mockReset().mockResolvedValue(undefined);
  vi.mocked(revealWorktreeEntry).mockReset().mockResolvedValue(undefined);
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onOpen = vi.fn();
  await act(async () =>
    root.render(
      <HerdrWorktreeMenu
        workspace={{ ...workspace, branch: workspace.branch ?? null }}
        projectId="demo"
        disabled={false}
        unavailable={unavailable}
        target={target}
        onOpen={onOpen}
      >
        <button onClick={onOpen}>{workspace.label}</button>
      </HerdrWorktreeMenu>,
    ),
  );
  const row = host.querySelector("button")!;
  const open = async () =>
    act(async () => {
      row.focus();
      row.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
        }),
      );
    });
  const item = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (button) => button.textContent === label,
    )!;
  return {
    onOpen,
    row,
    open,
    item,
    async dispose() {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    },
  };
}

it.each(["project", "worktree"] as const)(
  "copies the clicked %s metadata without opening its workspace",
  async (target) => {
    const workspace = {
      label: "feature checkout",
      directory: "C:\\projects\\demo checkout",
      branch: "feature/menu",
    };
    const menu = await renderMenu(workspace, target);
    try {
      for (const [label, value] of [
        ["common.copyPath", workspace.directory],
        ["herdr.copyName", workspace.label],
        ["git.copyBranchName", workspace.branch],
      ]) {
        await menu.open();
        expect(
          document.querySelector('[role="menu"]')?.getAttribute("aria-label"),
        ).toBe(
          target === "project"
            ? "herdr.projectActions"
            : "herdr.worktreeActions",
        );
        await act(async () => menu.item(label).click());
        expect(writeText).toHaveBeenLastCalledWith(value);
        expect(toast.success).toHaveBeenLastCalledWith("herdr.copied");
        expect(document.querySelector('[role="menu"]')).toBeNull();
        expect(document.activeElement).toBe(menu.row);
      }
      expect(menu.onOpen).not.toHaveBeenCalled();
      await menu.open();
      await act(async () => menu.item("fileTree.reveal").click());
      expect(revealWorktreeEntry).toHaveBeenCalledExactlyOnceWith(
        "demo",
        workspace.directory,
        "",
      );
      expect(menu.onOpen).not.toHaveBeenCalled();
    } finally {
      await menu.dispose();
    }
  },
);

it("allows copying an unavailable directory and omits an unknown branch", async () => {
  const menu = await renderMenu(
    { label: "missing", directory: "/projects/missing" },
    "worktree",
    true,
  );
  try {
    await menu.open();
    expect(menu.item("herdr.openWorktree").disabled).toBe(true);
    expect(menu.item("fileTree.reveal").disabled).toBe(true);
    expect(menu.item("git.copyBranchName")).toBeUndefined();
    expect(document.activeElement).toBe(menu.item("common.copyPath"));
    await act(async () => menu.item("common.copyPath").click());
    expect(writeText).toHaveBeenCalledExactlyOnceWith("/projects/missing");
    expect(revealWorktreeEntry).not.toHaveBeenCalled();
  } finally {
    await menu.dispose();
  }
});

it("keeps name copying available when the directory is unknown", async () => {
  const menu = await renderMenu({
    label: "demo",
    directory: null,
    branch: null,
  });
  try {
    await menu.open();
    expect(menu.item("common.copyPath").disabled).toBe(true);
    expect(menu.item("fileTree.copyRelativePath").disabled).toBe(true);
    expect(menu.item("fileTree.reveal").disabled).toBe(true);
    await act(async () => menu.item("herdr.copyName").click());
    expect(writeText).toHaveBeenCalledExactlyOnceWith("demo");
  } finally {
    await menu.dispose();
  }
});

it("reports clipboard and file manager failures without claiming success", async () => {
  const menu = await renderMenu({ label: "demo", directory: "/projects/demo" });
  try {
    vi.mocked(writeText).mockRejectedValueOnce(
      new Error("Clipboard unavailable"),
    );
    await menu.open();
    await act(async () => menu.item("common.copyPath").click());
    expect(toast.error).toHaveBeenLastCalledWith("Clipboard unavailable");
    expect(toast.success).not.toHaveBeenCalled();
    vi.mocked(revealWorktreeEntry).mockRejectedValueOnce(
      new Error("Directory unavailable"),
    );
    await menu.open();
    await act(async () => menu.item("fileTree.reveal").click());
    expect(toast.error).toHaveBeenLastCalledWith("Directory unavailable");
    expect(menu.onOpen).not.toHaveBeenCalled();
  } finally {
    await menu.dispose();
  }
});
