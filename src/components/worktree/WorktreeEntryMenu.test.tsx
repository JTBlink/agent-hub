// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { previewApi } from "../../features/preview/api";
import { queuePreviewDocument } from "../../features/preview/shared/openRequests";
import { toast } from "sonner";
import {
  developmentPlan,
  startDevelopment,
} from "../../lib/developmentPreview";
import { WorktreeEntryMenu } from "./WorktreeEntryMenu";
import {
  pasteWorktreeFiles,
  modifyWorktreeEntry,
  revealWorktreeEntry,
} from "../../lib/worktreeApi";
import { hasPendingWorktreeDocument } from "../../hooks/useWorktreeDocument";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

vi.mock("../../lib/developmentPreview", () => ({
  developmentPlan: vi.fn(async () => null),
  startDevelopment: vi.fn(),
}));
vi.mock("../../features/preview/api", () => ({
  previewApi: { openProject: vi.fn() },
}));
vi.mock("../../features/preview/shared/openRequests", () => ({
  queuePreviewDocument: vi.fn(),
}));
vi.mock("../../lib/worktreeApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/worktreeApi")>()),
  pasteWorktreeFiles: vi.fn(),
  modifyWorktreeEntry: vi.fn(),
  revealWorktreeEntry: vi.fn(),
}));
vi.mock("../../hooks/useWorktreeDocument", () => ({
  hasPendingWorktreeDocument: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
const t = (key: string) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
let host: HTMLDivElement;
let root: Root;
const changed = vi.fn();
const refresh = vi.fn();
const select = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(hasPendingWorktreeDocument).mockReturnValue(false);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
async function render(
  path = "src/notes.md",
  directory = false,
  symlink = false,
) {
  await act(async () =>
    root.render(
      <WorktreeEntryMenu
        projectId="demo"
        worktreePath="/workspace/demo"
        path={path}
        directory={directory}
        symlink={symlink}
        onChanged={changed}
        onRefresh={refresh}
        onSelect={select}
      >
        <button id="entry">{path || "demo"}</button>
      </WorktreeEntryMenu>,
    ),
  );
}
const menuItems = () => [
  ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
];
async function open(keyboard = false) {
  await act(async () =>
    host.querySelector("#entry")!.dispatchEvent(
      keyboard
        ? new KeyboardEvent("keydown", {
            key: "F10",
            shiftKey: true,
            bubbles: true,
          })
        : new MouseEvent("contextmenu", {
            clientX: 900,
            clientY: 700,
            bubbles: true,
            cancelable: true,
          }),
    ),
  );
}
async function choose(label: string) {
  await act(async () =>
    menuItems()
      .find((item) => item.textContent === label)!
      .click(),
  );
}
async function input(value: string) {
  await act(async () => {
    const element = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

it("opens a root menu by keyboard and restores focus after escape", async () => {
  await render("", true);
  await open(true);
  expect(menuItems().map((item) => item.textContent)).toEqual([
    "fileTree.paste",
    "fileTree.newFile",
    "fileTree.newDirectory",
    "fileTree.reveal",
    "fileTree.copyPath",
    "fileTree.copyRelativePath",
    "worktree.refreshFiles",
  ]);
  expect(document.activeElement).toBe(menuItems()[0]);
  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    ),
  );
  expect(document.activeElement?.textContent).toBe("worktree.refreshFiles");
  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(host.querySelector("#entry"));
});

it("copies absolute and relative paths, reveals the exact target and opens files", async () => {
  await render();
  await open();
  await choose("fileTree.copyPath");
  expect(writeText).toHaveBeenLastCalledWith("/workspace/demo/src/notes.md");
  await open();
  await choose("fileTree.copyRelativePath");
  expect(writeText).toHaveBeenLastCalledWith("src/notes.md");
  await open();
  await choose("fileTree.reveal");
  expect(revealWorktreeEntry).toHaveBeenCalledWith(
    "demo",
    "/workspace/demo",
    "src/notes.md",
  );
  await open();
  await choose("fileTree.open");
  expect(select).toHaveBeenCalledWith("src/notes.md");
});

it("pastes into the chosen folder from its context menu", async () => {
  await render("dist", true);
  vi.mocked(pasteWorktreeFiles).mockResolvedValue(["dist/example.txt"]);
  await open();
  await choose("fileTree.paste");
  expect(pasteWorktreeFiles).toHaveBeenCalledWith(
    "demo",
    "/workspace/demo",
    "dist",
  );
  expect(refresh).toHaveBeenCalledOnce();
});

it.each([{ metaKey: true }, { ctrlKey: true }])(
  "pastes into a focused file's parent with a keyboard shortcut (%s)",
  async (modifier) => {
    await render("docs/notes.md");
    await act(async () => {
      host.querySelector("#entry")!.dispatchEvent(
        new KeyboardEvent("keydown", {
          ...modifier,
          key: "v",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(pasteWorktreeFiles).toHaveBeenCalledWith(
      "demo",
      "/workspace/demo",
      "docs",
    );
    expect(refresh).toHaveBeenCalledOnce();
  },
);

it("reports paste errors and refreshes after a partial failure", async () => {
  await render("", true);
  vi.mocked(pasteWorktreeFiles).mockRejectedValue(
    new Error("Name already exists"),
  );
  await open();
  await choose("fileTree.paste");
  expect(toast.error).toHaveBeenCalledWith("Name already exists");
  expect(refresh).toHaveBeenCalledOnce();
});

it("creates a sibling file, prevents duplicate requests and preserves input on failure", async () => {
  await render();
  await open();
  await choose("fileTree.newFile");
  await input("draft.md");
  let reject!: (reason: Error) => void;
  vi.mocked(modifyWorktreeEntry).mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  await submit();
  await submit();
  expect(modifyWorktreeEntry).toHaveBeenCalledTimes(1);
  expect(modifyWorktreeEntry).toHaveBeenCalledWith(
    "demo",
    "/workspace/demo",
    "src",
    { kind: "new_file", name: "draft.md" },
  );
  await act(async () => reject(new Error("Already exists")));
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    "Already exists",
  );
  expect(host.querySelector("input")?.value).toBe("draft.md");
  expect(changed).not.toHaveBeenCalled();
  vi.mocked(modifyWorktreeEntry).mockResolvedValueOnce("src/draft.md");
  await submit();
  expect(changed).toHaveBeenCalledWith({
    kind: "new_file",
    path: "src",
    nextPath: "src/draft.md",
  });
  expect(select).toHaveBeenCalledWith("src/draft.md");
  expect(refresh).toHaveBeenCalledOnce();
  expect(host.querySelector("dialog")).toBeNull();
});

it("requires delete confirmation and keeps unsaved descendants intact", async () => {
  await render("src", true);
  await open();
  await choose("common.delete");
  expect(modifyWorktreeEntry).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
  vi.mocked(hasPendingWorktreeDocument).mockReturnValue(true);
  await act(async () =>
    [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent === "common.delete")!
      .click(),
  );
  expect(modifyWorktreeEntry).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    "fileTree.saveFirst",
  );
  vi.mocked(hasPendingWorktreeDocument).mockReturnValue(false);
  vi.mocked(modifyWorktreeEntry).mockResolvedValueOnce("src");
  await act(async () =>
    [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent === "common.delete")!
      .click(),
  );
  expect(modifyWorktreeEntry).toHaveBeenCalledWith(
    "demo",
    "/workspace/demo",
    "src",
    { kind: "delete" },
  );
  expect(changed).toHaveBeenCalledWith({
    kind: "delete",
    path: "src",
    nextPath: "src",
  });
});

it("renames directories and blocks unsafe link operations while allowing path copying", async () => {
  await render("src", true);
  await open();
  await choose("fileTree.rename");
  expect(host.querySelector("input")?.value).toBe("src");
  await input("source");
  vi.mocked(modifyWorktreeEntry).mockResolvedValueOnce("source");
  await submit();
  expect(changed).toHaveBeenCalledWith({
    kind: "rename",
    path: "src",
    nextPath: "source",
  });
  await render("link", false, true);
  await open();
  expect(
    menuItems().find((item) => item.textContent === "fileTree.open")?.disabled,
  ).toBe(true);
  expect(
    menuItems().find((item) => item.textContent === "common.delete")?.disabled,
  ).toBe(true);
  expect(
    menuItems().find((item) => item.textContent === "fileTree.copyPath")
      ?.disabled,
  ).toBe(false);
});

it("opens supported files in browser preview and blocks unsaved changes", async () => {
  await render("docs/index.HTML");
  const document = {
    id: "preview",
    kind: "html" as const,
    title: "index.HTML",
    path: "/workspace/demo/docs/index.HTML",
    content: "<h1>Demo</h1>",
    revision: "saved",
  };
  vi.mocked(previewApi.openProject).mockResolvedValue(document);
  await open();
  await choose("fileTree.previewInBrowser");
  expect(previewApi.openProject).toHaveBeenCalledWith(
    "demo",
    "/workspace/demo",
    "docs/index.HTML",
  );
  expect(queuePreviewDocument).toHaveBeenCalledWith(document);
  vi.mocked(previewApi.openProject).mockClear();
  vi.mocked(hasPendingWorktreeDocument).mockReturnValue(true);
  await open();
  await choose("fileTree.previewInBrowser");
  expect(previewApi.openProject).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith("fileTree.saveFirst");
});

it("omits browser preview for directories and other files and disables links", async () => {
  for (const [path, directory] of [
    ["docs.md", true],
    ["archive.zip", false],
  ] as const) {
    await render(path, directory);
    await open();
    expect(
      menuItems().some(
        (item) => item.textContent === "fileTree.previewInBrowser",
      ),
    ).toBe(false);
    await choose("worktree.refreshFiles");
  }
  await render("link.md", false, true);
  await open();
  expect(
    menuItems().find((item) => item.textContent === "fileTree.previewInBrowser")
      ?.disabled,
  ).toBe(true);
});

it("runs saved scripts in a new internal terminal and blocks unsaved scripts", async () => {
  await render("scripts/run.SH");
  await open();
  await choose("fileTree.runInTerminal");
  expect(navigate).toHaveBeenCalledWith(expect.any(String), {
    state: {
      terminalScript: {
        projectId: "demo",
        worktreePath: "/workspace/demo",
        scriptPath: "scripts/run.SH",
      },
    },
  });
  navigate.mockClear();
  vi.mocked(hasPendingWorktreeDocument).mockReturnValue(true);
  await open();
  await choose("fileTree.runInTerminal");
  expect(navigate).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith("fileTree.saveFirst");
});

it("offers script execution only for files and disables symbolic links", async () => {
  for (const [path, directory] of [
    ["folder.sh", true],
    ["notes.md", false],
  ] as const) {
    await render(path, directory);
    await open();
    expect(
      menuItems().some((item) => item.textContent === "fileTree.runInTerminal"),
    ).toBe(false);
    await choose("worktree.refreshFiles");
  }
  await render("link.bat", false, true);
  await open();
  expect(
    menuItems().find((item) => item.textContent === "fileTree.runInTerminal")
      ?.disabled,
  ).toBe(true);
});

it.each([true, false])(
  "previews Vite HTML through its development server (running=%s)",
  async (running) => {
    await render("index.html");
    const plan = {
      directory: "/workspace/demo",
      url: "http://127.0.0.1:5173/index.html",
      running,
      launch: { relative_path: "index.html", port: 5173 },
    };
    vi.mocked(developmentPlan).mockResolvedValue(plan);
    vi.mocked(startDevelopment).mockResolvedValue("http://127.0.0.1:5173");
    vi.mocked(previewApi.openProject).mockResolvedValue({
      id: "html",
      title: "index.html",
      kind: "html",
      content: "<div></div>",
      revision: "saved",
      url: "http://static.invalid/index.html",
    });
    await open();
    await choose("fileTree.previewInBrowser");
    expect(startDevelopment).toHaveBeenCalledTimes(running ? 0 : 1);
    expect(queuePreviewDocument).toHaveBeenCalledWith(
      expect.objectContaining({ url: "http://127.0.0.1:5173/index.html" }),
    );
  },
);

it("reports development startup errors without opening a blank static preview", async () => {
  await render("index.html");
  vi.mocked(developmentPlan).mockResolvedValue({
    directory: "/workspace/demo",
    url: "http://127.0.0.1:5173/index.html",
    running: false,
    launch: { relative_path: "index.html", port: 5173 },
  });
  vi.mocked(startDevelopment).mockRejectedValue(
    new Error("Development server failed"),
  );
  await open();
  await choose("fileTree.previewInBrowser");
  expect(previewApi.openProject).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith("Development server failed");
});
