// @vitest-environment jsdom
import { act, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { makeProject } from "../../../tests/fixtures/workspace";
import { SidebarProjectFiles } from "./SidebarProjectFiles";
import { WorkspaceFilesProvider } from "./WorkspaceFilesContext";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { ProjectSkills } from "../../views/ProjectSkills";
import { previewApi } from "../../features/preview/api";
import { codeEditor, installCodeEditorGeometry } from "../../test/codeEditor";
import { PREVIEW_OPEN_EVENT } from "../../features/preview/shared/openRequests";
import { worktreeUrl } from "../../lib/worktreeApi";
import { GitFileEditor } from "../git/GitFileEditor";
import {
  GitEditorTabsContext,
  GitEditorVisibilityContext,
} from "../../hooks/gitEditorVisibility";

function RouteProbe() {
  const location = useLocation();
  return (
    <output data-route>
      {location.pathname}
      {location.search}
    </output>
  );
}

function GitEditor() {
  const setVisible = useContext(GitEditorVisibilityContext);
  const tabs = useContext(GitEditorTabsContext);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setVisible?.(open);
  }, [open, setVisible]);
  return (
    <div data-git-editor>
      <button data-git-terminal onClick={tabs?.onTerminal}>
        Open terminal
      </button>
      {open && (
        <GitFileEditor
          activeId={project.id}
          selection={{ path: "src/changed.ts", staged: false }}
          fileView={false}
          diff=""
          files={[]}
          onFileViewChange={() => {}}
          onClose={() => setOpen(false)}
        />
      )}
      {createPortal(
        <button data-git-change onClick={() => setOpen(true)}>
          Changed file
        </button>,
        document.body,
      )}
    </div>
  );
}

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  files: vi.fn(),
  read: vi.fn(),
  open: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../features/preview/api", () => ({
  previewApi: {
    openProject: vi.fn(),
    info: vi.fn().mockResolvedValue({ profiles: [] }),
    list: vi.fn().mockResolvedValue([]),
    captureRendered: vi.fn().mockResolvedValue("png-data"),
    export: vi.fn().mockResolvedValue(undefined),
    readDocument: vi.fn(),
    saveDocument: vi.fn(),
    closeDocument: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("../../features/preview/web/BrowserSurface", () => ({
  BrowserSurface: () => <div>Browser preview</div>,
}));
vi.mock("../../hooks/useOpenProject", () => ({
  useOpenProject: () => ({ openProject: mocks.open, isOpening: false }),
}));
const t = (key: string) => key;
const project = { ...makeProject(), id: "workspace-interaction" };
const topic = "<workspace>/topic";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../../i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("../../context/AppContext", () => ({
  useApp: () => ({ projects: [project], refreshProjects: mocks.refresh }),
}));
vi.mock("../../lib/tauri", async (original) => ({
  ...(await original<typeof import("../../lib/tauri")>()),
  removeProject: mocks.remove,
}));
vi.mock("../../lib/worktreeApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/worktreeApi")>()),
  getProjectWorktrees: mocks.list,
  getWorktreeFiles: mocks.files,
  readWorktreeFile: mocks.read,
}));
vi.mock("../terminal/TerminalWorkspace", () => ({
  TerminalWorkspace: ({
    shown,
    toolbar,
    toolbarEnd,
    extraTabs,
    content,
    onSelectTerminal,
    onProjectSkills,
    projectsReady,
    onStartupStateChange,
  }: {
    shown: boolean;
    toolbar?: ReactNode;
    toolbarEnd?: ReactNode;
    extraTabs?: ReactNode;
    content?: ReactNode;
    onSelectTerminal?: () => void;
    onProjectSkills?: () => void;
    projectsReady: boolean;
    onStartupStateChange?: (state: {
      ready: boolean;
      error: string;
      retry: () => void;
    }) => void;
  }) => {
    useEffect(() => {
      onStartupStateChange?.({
        ready: projectsReady,
        error: "",
        retry: () => {},
      });
    }, [projectsReady, onStartupStateChange]);
    return (
      <div>
        {toolbar ?? (
          <div data-terminal-toolbar>
            <div role="tablist">
              <button
                role="tab"
                aria-selected={shown}
                onClick={onSelectTerminal}
              >
                terminal.title
              </button>
              {extraTabs}
            </div>
            {toolbarEnd}
            {onProjectSkills && (
              <button
                aria-label="worktree.projectSkills"
                onClick={onProjectSkills}
              >
                Skills action
              </button>
            )}
          </div>
        )}
        <div hidden={!shown} data-terminal>
          Shell
        </div>
        {content}
      </div>
    );
  },
}));
vi.mock("../file-reader/FileContent", () => ({
  FileContent: ({
    file,
    onPreview,
  }: {
    file: { path: string; content: string };
    onPreview?: () => void;
  }) => (
    <>
      <output aria-label={file.path}>{file.content}</output>
      {onPreview && (
        <button data-preview onClick={onPreview}>
          Preview
        </button>
      )}
    </>
  ),
}));
vi.mock("../../views/ProjectDetail", () => ({
  ProjectDetail: () => <div>Project skills panel</div>,
}));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([
    { path: project.path, branch: "main", is_main: true, available: true },
    { path: topic, branch: "topic", is_main: false, available: true },
  ]);
  mocks.files.mockImplementation(async (_id, _root, relative) =>
    relative === "src"
      ? [
          {
            name: "app.ts",
            path: "src/app.ts",
            is_dir: false,
            is_symlink: false,
          },
        ]
      : [{ name: "src", path: "src", is_dir: true, is_symlink: false }],
  );
  mocks.read.mockResolvedValue("export const ready = true;");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(
  onStartupStateChange?: (state: {
    ready: boolean;
    error: string;
    retry: () => void;
  }) => void,
) {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[worktreeUrl(project.id, project.path)]}>
        <Link data-main to={worktreeUrl(project.id, project.path)}>
          Main
        </Link>
        <Link data-topic to={worktreeUrl(project.id, topic)}>
          Topic
        </Link>
        <Link data-git to="/git">
          Git
        </Link>
        <RouteProbe />
        <WorkspaceFilesProvider>
          <SidebarProjectFiles />
          <ProjectWorkspace
            page={<GitEditor />}
            onStartupStateChange={onStartupStateChange}
          />
        </WorkspaceFilesProvider>
        <Routes>
          <Route path="/" element={<p>Welcome</p>} />
          <Route path="/git" element={null} />
          <Route path="/project/:id" element={null} />
          <Route path="/project/:id/skills" element={<ProjectSkills />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}
async function click(selector: string) {
  const node = host.querySelector<HTMLElement>(selector);
  expect(node).not.toBeNull();
  await act(async () => node?.click());
}

it("keeps skills secondary and returns to the same worktree without unmounting its terminal", async () => {
  await render();
  await click("[data-topic]");
  await click('aside button[title="src"]');
  const explorer = host.querySelector("aside");
  const fileRequests = mocks.files.mock.calls.length;
  const terminal = host.querySelector("[data-terminal]");
  const skills = host.querySelector<HTMLButtonElement>(
    '[aria-label="worktree.projectSkills"]',
  )!;
  expect(skills.closest("[data-terminal-toolbar]")).not.toBeNull();
  expect(host.querySelector("header")).toBeNull();
  const routeBefore = host.querySelector("[data-route]")?.textContent;
  await act(async () => skills.click());
  expect(host.textContent).toContain("Project skills panel");
  expect(host.querySelector("[data-terminal-toolbar]")).toBeNull();
  expect(host.querySelector("aside")).toBe(explorer);
  expect(host.querySelector('aside button[title="src/app.ts"]')).not.toBeNull();
  expect(mocks.files.mock.calls.length).toBe(fileRequests);
  expect(host.querySelector("[data-route]")?.textContent).toBe(routeBefore);
  const back = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "worktree.back",
  )!;
  expect(back.closest('[role="toolbar"]')).not.toBeNull();
  await act(async () => back.click());
  expect(host.querySelector("[data-terminal]")).toBe(terminal);
  expect(host.querySelector("aside")?.textContent).toContain("src");
});

it("loads only expanded directories and previews files within the selected checkout", async () => {
  await render();
  expect(mocks.files).toHaveBeenCalledWith(project.id, project.path, "");
  expect(mocks.files.mock.calls.some((call) => call[2] === "src")).toBe(false);
  await click('aside button[title="src"]');
  expect(mocks.files).toHaveBeenLastCalledWith(project.id, project.path, "src");
  await click('aside button[title="src/app.ts"]');
  expect(mocks.read).toHaveBeenCalledWith(
    project.id,
    project.path,
    "src/app.ts",
  );
  expect(
    host.querySelector('output[aria-label="src/app.ts"]')?.textContent,
  ).toContain("ready");
  expect(host.querySelector("[data-terminal]")?.hasAttribute("hidden")).toBe(
    true,
  );
  await click('[aria-label="fileReader.closeFile"]');
  expect(host.querySelector("[data-terminal]")?.hasAttribute("hidden")).toBe(
    false,
  );
  await click("[data-topic]");
  await click('aside button[title="src"]');
  await click('aside button[title="src/app.ts"]');
  expect(mocks.read).toHaveBeenLastCalledWith(project.id, topic, "src/app.ts");
});

it("collapses folders, refreshes the tree and retains file selection for each checkout", async () => {
  await render();
  await click('aside button[title="src"]');
  await click('aside button[title="src/app.ts"]');
  const terminal = host.querySelector("[data-terminal]");
  await click('aside button[aria-label="worktree.collapseFiles"]');
  expect(host.querySelector('aside button[title="src/app.ts"]')).toBeNull();
  expect(host.querySelector('output[aria-label="src/app.ts"]')).not.toBeNull();
  await click('aside button[title="src"]');
  expect(
    host
      .querySelector('aside button[title="src/app.ts"]')
      ?.getAttribute("aria-pressed"),
  ).toBe("true");
  await click("[data-topic]");
  expect(host.querySelector('output[aria-label="src/app.ts"]')).toBeNull();
  await click("[data-main]");
  expect(host.querySelector('output[aria-label="src/app.ts"]')).not.toBeNull();
  const before = mocks.files.mock.calls.length;
  await click('aside button[aria-label="worktree.refreshFiles"]');
  expect(mocks.files.mock.calls.length).toBeGreaterThan(before);
  expect(host.querySelector("[data-terminal]")).toBe(terminal);
  const rootButton = host.querySelector<HTMLButtonElement>(
    "aside button[aria-expanded]",
  )!;
  await act(async () => rootButton.click());
  expect(rootButton.getAttribute("aria-expanded")).toBe("false");
  expect(host.querySelector("aside [hidden]")).not.toBeNull();
});

it("omits duplicate branch context and refresh from the terminal/file toolbar", async () => {
  await render();
  const terminalButton = () =>
    Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "terminal.title",
    )!;
  const expectCompactToolbar = () => {
    const toolbar = terminalButton().closest("[data-terminal-toolbar]")!;
    expect(toolbar.textContent).not.toContain("main");
    expect(toolbar.textContent).not.toContain("topic");
    expect(toolbar.querySelector('[aria-label="worktree.refresh"]')).toBeNull();
    expect(
      toolbar.querySelector('[aria-label="worktree.projectSkills"]') === null,
    ).toBe(false);
  };
  expectCompactToolbar();
  await click('aside button[title="src"]');
  await click('aside button[title="src/app.ts"]');
  expectCompactToolbar();
  const fileTab = host.querySelector('[role="tab"][title="src/app.ts"]')!;
  expect(fileTab.closest('[role="tablist"]')).toBe(
    terminalButton().closest('[role="tablist"]'),
  );
  expect(fileTab.getAttribute("aria-selected")).toBe("true");
  expect(terminalButton().getAttribute("aria-selected")).toBe("false");
  await act(async () => terminalButton().click());
  expect(host.querySelector("[data-terminal]")?.hasAttribute("hidden")).toBe(
    false,
  );
  expectCompactToolbar();
  await click('[aria-label="fileReader.closeFile"]');
  expectCompactToolbar();
  await click("[data-topic]");
  expectCompactToolbar();
});

it("omits the fixed source control tab and preserves terminal, file, and change navigation", async () => {
  await render();
  await click("[data-topic]");
  await click('aside button[title="src"]');
  await click('aside button[title="src/app.ts"]');
  const terminal = host.querySelector("[data-terminal]");
  await click("[data-git]");
  const gitTab = () =>
    Array.from(host.querySelectorAll('[role="tab"]')).find(
      (node) => node.textContent === "git.sourceControl",
    );
  const fileTab = () => host.querySelector('[role="tab"][title="src/app.ts"]')!;
  expect(terminal?.closest("section")?.hidden).toBe(false);
  expect(gitTab()).toBeUndefined();
  expect(fileTab().getAttribute("aria-selected")).toBe("true");
  expect(
    host.querySelector<HTMLElement>("[data-git-editor]")?.parentElement?.hidden,
  ).toBe(true);
  await act(async () =>
    fileTab().dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  expect(host.querySelector('output[aria-label="src/app.ts"]')).not.toBeNull();
  expect(mocks.read).toHaveBeenLastCalledWith(project.id, topic, "src/app.ts");
  expect(
    host.querySelector<HTMLElement>("[data-git-editor]")?.parentElement?.hidden,
  ).toBe(true);
  await act(async () =>
    document.querySelector<HTMLButtonElement>("[data-git-change]")!.click(),
  );
  expect(
    host.querySelector<HTMLElement>("[data-git-editor]")?.parentElement?.hidden,
  ).toBe(false);
  const changeTab = () =>
    host.querySelector<HTMLButtonElement>(
      '[role="tab"][title="src/changed.ts"]',
    )!;
  expect(changeTab().closest('[role="tablist"]')).toBe(
    fileTab().closest('[role="tablist"]'),
  );
  expect(changeTab().getAttribute("aria-selected")).toBe("true");
  expect(host.querySelector('[data-git-editor] [role="tablist"]')).toBeNull();
  const terminalTab = Array.from(host.querySelectorAll("button")).find(
    (node) => node.textContent === "terminal.title",
  )!;
  await act(async () => terminalTab.click());
  expect(terminal?.hasAttribute("hidden")).toBe(false);
  expect(host.querySelector("[data-terminal]")).toBe(terminal);
  expect(fileTab().getAttribute("aria-selected")).toBe("false");
  expect(changeTab().getAttribute("aria-selected")).toBe("false");
  await act(async () => changeTab().click());
  expect(changeTab().getAttribute("aria-selected")).toBe("true");
  expect(gitTab()).toBeUndefined();
  expect(
    host.querySelector<HTMLElement>("[data-git-editor]")?.parentElement?.hidden,
  ).toBe(false);
  await click('[aria-label="common.close"]');
  expect(terminal?.hasAttribute("hidden")).toBe(false);
  expect(
    host.querySelector<HTMLElement>("[data-git-editor]")?.parentElement?.hidden,
  ).toBe(true);
});

it("keeps the terminal visible when entering source control without an open file", async () => {
  await render();
  const terminal = host.querySelector("[data-terminal]");
  await click("[data-git]");
  expect(terminal?.hasAttribute("hidden")).toBe(false);
  expect(host.querySelector("[data-terminal]")).toBe(terminal);
  expect(
    host.querySelector<HTMLElement>("[data-git-editor]")?.parentElement?.hidden,
  ).toBe(true);
});

it("opens project skills from source control without replacing its sidebar or navigating", async () => {
  await render();
  await click("[data-git]");
  const change = document.querySelector("[data-git-change]");
  const editor = host.querySelector("[data-git-editor]");
  const terminal = host.querySelector("[data-terminal]");
  await click('[aria-label="worktree.projectSkills"]');
  expect(host.textContent).toContain("Project skills panel");
  expect(host.querySelector("[data-route]")?.textContent).toBe("/git");
  expect(document.querySelector("[data-git-change]")).toBe(change);
  expect(host.querySelector("[data-git-editor]")).toBe(editor);
  expect(host.querySelector("[data-terminal]")).toBe(terminal);
  const back = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "worktree.back",
  )!;
  await act(async () => back.click());
  expect(host.textContent).not.toContain("Project skills panel");
  expect(host.querySelector("[data-route]")?.textContent).toBe("/git");
  expect(document.querySelector("[data-git-change]")).toBe(change);
  expect(terminal?.hasAttribute("hidden")).toBe(false);
});

it("opens the current terminal from a Git editor without closing the editor or changing the checkout", async () => {
  await render();
  await click("[data-topic]");
  await click("[data-git]");
  await act(async () =>
    document.querySelector<HTMLElement>("[data-git-change]")!.click(),
  );
  const terminal = host.querySelector<HTMLElement>("[data-terminal]")!;
  expect(terminal.hidden).toBe(true);
  const routeBefore = host.querySelector("[data-route]")?.textContent;
  await click("[data-git-terminal]");
  expect(terminal.hidden).toBe(false);
  expect(host.querySelector("[data-terminal]")).toBe(terminal);
  expect(host.querySelector("[data-route]")?.textContent).toBe(routeBefore);
  const gitTab = [
    ...host.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ].find((tab) => tab.textContent?.includes("changed.ts"))!;
  expect(gitTab).toBeTruthy();
  await act(async () => gitTab.click());
  expect(terminal.hidden).toBe(true);
});

it("shows a recovery page for a missing workspace and returns to its files after retry", async () => {
  await render();
  mocks.list.mockResolvedValue([
    { path: project.path, is_main: true, available: false },
  ]);
  await act(async () => window.dispatchEvent(new Event("focus")));
  const editor = host.querySelector(".workbench-editor-panel")!;
  expect(editor.textContent).toContain("worktree.missingDirectory.title");
  expect(editor.textContent).toContain("worktree.missingDirectory.description");
  expect(
    editor.querySelector("[data-terminal]")?.closest("[hidden]"),
  ).not.toBeNull();
  expect(
    host.querySelector('aside[aria-label="fileReader.explorer"]'),
  ).toBeNull();
  const openOther = [
    ...editor.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (button) => button.textContent === "worktree.missingDirectory.openOther",
  )!;
  await act(async () => openOther.click());
  expect(mocks.open).toHaveBeenCalledOnce();
  let finish!: (
    worktrees: { path: string; is_main: boolean; available: boolean }[],
  ) => void;
  mocks.list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const retry = [...editor.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("worktree.missingDirectory.retry"),
  )!;
  await act(async () => retry.click());
  expect(editor.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(retry.disabled).toBe(true);
  await act(async () =>
    finish([{ path: project.path, is_main: true, available: true }]),
  );
  expect(editor.textContent).not.toContain("worktree.missingDirectory.title");
  expect(
    host.querySelector('aside[aria-label="fileReader.explorer"]'),
  ).not.toBeNull();
});

it("replaces inaccessible workspace system errors with friendly recovery guidance", async () => {
  await render();
  mocks.list.mockRejectedValueOnce(
    new Error("No such file or directory (os error 2)"),
  );
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(host.textContent).toContain("worktree.missingDirectory.accessTitle");
  expect(host.textContent).not.toContain("os error 2");
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("keeps the recovery page interactive when startup restores a deleted project", async () => {
  const startup = vi.fn();
  mocks.list.mockResolvedValue([
    { path: project.path, is_main: true, available: false },
  ]);
  await render(startup);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(startup).toHaveBeenLastCalledWith({
    ready: true,
    error: "",
    retry: expect.any(Function),
  });
});

it("removes an invalid project only after confirmation and returns to the welcome page", async () => {
  await render();
  mocks.list.mockResolvedValue([
    { path: project.path, is_main: true, available: false },
  ]);
  await act(async () => window.dispatchEvent(new Event("focus")));
  const remove = () =>
    [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes(
        "worktree.missingDirectory.removeInvalidProject",
      ),
    )!;
  await act(async () => remove().click());
  expect(mocks.remove).not.toHaveBeenCalled();
  const dialog = document.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain(
    "worktree.missingDirectory.removeConfirm",
  );
  const cancel = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === "common.cancel",
  )!;
  await act(async () => cancel.click());
  expect(mocks.remove).not.toHaveBeenCalled();
  await act(async () => remove().click());
  const confirm = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[role="alertdialog"] button',
    ),
  ].find(
    (button) => button.textContent === "worktree.missingDirectory.removeRecord",
  )!;
  await act(async () => confirm.click());
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(project.id);
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(host.querySelector("[data-route]")?.textContent).toBe("/");
});

it("adds a preview after the source tab without navigation, reuses it, and closes its document", async () => {
  mocks.files.mockResolvedValue([
    { name: "README.md", path: "README.md", is_dir: false, is_symlink: false },
  ]);
  mocks.read.mockResolvedValue("# Preview example");
  vi.mocked(previewApi.openProject).mockResolvedValue({
    id: "workspace-preview",
    kind: "markdown",
    title: "README.md",
    content: "# Preview example",
    revision: "saved",
  });
  const navigatePreview = vi.fn();
  window.addEventListener(PREVIEW_OPEN_EVENT, navigatePreview);
  try {
    await render();
    await act(async () => window.dispatchEvent(new Event("focus")));
    await click('aside button[title="README.md"]');
    const route = host.querySelector("[data-route]")?.textContent;
    await click("[data-preview]");
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    const tabs = [...host.querySelectorAll('[role="tab"]')];
    const source = tabs.findIndex((tab) => tab.textContent === "README.md");
    expect(tabs[source + 1].textContent).toBe("README.md · fileReader.preview");
    expect(tabs[source + 1].getAttribute("aria-selected")).toBe("true");
    expect(tabs[source].getAttribute("aria-selected")).toBe("false");
    expect(host.querySelector("article h1")?.textContent).toBe(
      "Preview example",
    );
    expect(host.querySelector("[data-route]")?.textContent).toBe(route);
    expect(navigatePreview).not.toHaveBeenCalled();
    const menuAction = async (label: string) => {
      await click(".preview-more-trigger");
      const button = [
        ...document.querySelectorAll<HTMLButtonElement>(
          ".preview-toolbar button",
        ),
      ].find((button) => button.textContent === label)!;
      expect(button).toBeDefined();
      await act(async () => button.click());
    };
    await click(".preview-more-trigger");
    for (const label of [
      "preview.pick",
      "preview.screenshot",
      "preview.fullScreenshot",
      "preview.copyScreenshot",
      "preview.source",
      "preview.find",
      "preview.downloads",
      "preview.history",
      "preview.developerTools",
      "preview.openExternal",
      "settings.about",
      "preview.settings",
      "preview.annotations",
    ]) {
      expect(
        [...document.querySelectorAll(".preview-toolbar button")].some(
          (button) => button.textContent === label,
        ),
      ).toBe(true);
    }
    await act(async () =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          ".preview-toolbar button",
        ),
      ]
        .find((button) => button.textContent === "preview.screenshot")!
        .click(),
    );
    expect(previewApi.captureRendered).toHaveBeenCalledWith(
      expect.stringContaining("Preview example"),
      expect.any(Number),
      expect.any(Number),
      "default",
      false,
      expect.any(Object),
    );
    expect(previewApi.export).toHaveBeenCalledWith(
      "page-viewport.png",
      "png-data",
      true,
      undefined,
    );
    await menuAction("preview.pick");
    const heading = host.querySelector<HTMLElement>(".preview-markdown h1")!;
    Object.defineProperty(heading, "innerText", {
      value: heading.textContent,
      configurable: true,
    });
    await act(async () => heading.click());
    expect(host.querySelector(".preview-note")?.textContent).toContain(
      "Preview example",
    );
    expect(
      [...host.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "preview.sendAgent",
      )?.disabled,
    ).toBe(false);
    installCodeEditorGeometry();
    await menuAction("preview.source");
    await act(async () =>
      codeEditor(host).dispatch({
        changes: {
          from: 0,
          to: codeEditor(host).state.doc.length,
          insert: "# Edited preview",
        },
      }),
    );
    await click('[aria-label="preview.closeTab"]');
    expect(previewApi.closeDocument).not.toHaveBeenCalled();
    expect(host.textContent).toContain("preview.saveBeforeClose");
    // Switching away preserves the editable preview and its annotations.
    await act(async () => (tabs[source] as HTMLElement).click());
    await act(async () => (tabs[source + 1] as HTMLElement).click());
    expect(codeEditor(host).state.sliceDoc()).toBe("# Edited preview");
    vi.mocked(previewApi.saveDocument).mockResolvedValue({
      id: "workspace-preview",
      kind: "markdown",
      title: "README.md",
      content: "# Edited preview",
      revision: "saved-again",
    });
    await menuAction("common.save");
    expect(previewApi.saveDocument).toHaveBeenCalledWith(
      "workspace-preview",
      "# Edited preview",
      "saved",
    );
    await act(async () => (tabs[source] as HTMLElement).click());
    await click("[data-preview]");
    expect(previewApi.openProject).toHaveBeenCalledTimes(1);
    expect(
      host.querySelectorAll('[role="tab"][title="README.md"]'),
    ).toHaveLength(2);
    await click('[aria-label="preview.closeTab"]');
    expect(previewApi.closeDocument).toHaveBeenCalledWith("workspace-preview");
    expect(
      host.querySelectorAll('[role="tab"][title="README.md"]'),
    ).toHaveLength(1);
    expect(host.querySelector('output[aria-label="README.md"]')).not.toBeNull();
  } finally {
    window.removeEventListener(PREVIEW_OPEN_EVENT, navigatePreview);
  }
});
