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
import { worktreeUrl } from "../../lib/worktreeApi";
import { GitEditorVisibilityContext } from "../../hooks/gitEditorVisibility";

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
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setVisible?.(open);
  }, [open, setVisible]);
  return (
    <div data-git-editor>
      {open && (
        <button data-close-change onClick={() => setOpen(false)}>
          Close change
        </button>
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
}));
const t = (key: string) => key;
const project = { ...makeProject(), id: "workspace-interaction" };
const topic = "<workspace>/topic";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../../i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("../../context/AppContext", () => ({
  useApp: () => ({ projects: [project] }),
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
  }: {
    shown: boolean;
    toolbar?: ReactNode;
    toolbarEnd?: ReactNode;
    extraTabs?: ReactNode;
    content?: ReactNode;
    onSelectTerminal?: () => void;
    onProjectSkills?: () => void;
  }) => (
    <div>
      {toolbar ?? (
        <div data-terminal-toolbar>
          <div role="tablist">
            <button role="tab" aria-selected={shown} onClick={onSelectTerminal}>
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
  ),
}));
vi.mock("../file-reader/FileContent", () => ({
  FileContent: ({ file }: { file: { path: string; content: string } }) => (
    <output aria-label={file.path}>{file.content}</output>
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
async function render() {
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
          <ProjectWorkspace page={<GitEditor />} />
        </WorkspaceFilesProvider>
        <Routes>
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
  const terminalTab = Array.from(host.querySelectorAll("button")).find(
    (node) => node.textContent === "terminal.title",
  )!;
  await act(async () => terminalTab.click());
  expect(terminal?.hasAttribute("hidden")).toBe(false);
  expect(host.querySelector("[data-terminal]")).toBe(terminal);
  expect(fileTab().getAttribute("aria-selected")).toBe("false");
  await act(async () =>
    document.querySelector<HTMLButtonElement>("[data-git-change]")!.click(),
  );
  expect(gitTab()).toBeUndefined();
  expect(
    host.querySelector<HTMLElement>("[data-git-editor]")?.parentElement?.hidden,
  ).toBe(false);
  await click("[data-close-change]");
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
