// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { makeProject } from "../../../tests/fixtures/workspace";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { ProjectSkills } from "../../views/ProjectSkills";
import { worktreeUrl } from "../../lib/worktreeApi";

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
  TerminalWorkspace: ({ shown }: { shown: boolean }) => (
    <div hidden={!shown} data-terminal>
      Shell
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
        <ProjectWorkspace onMaximizedChange={() => {}} maximized={false} />
        <Routes>
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
  const terminal = host.querySelector("[data-terminal]");
  const skills = host.querySelector<HTMLAnchorElement>('a[href*="/skills"]')!;
  expect(skills.getAttribute("href")).toBe(
    `/project/${project.id}/skills?${new URLSearchParams({ worktree: topic })}`,
  );
  await act(async () => skills.click());
  expect(host.textContent).toContain("Project skills panel");
  const back = host.querySelector<HTMLAnchorElement>(
    `a[href="${worktreeUrl(project.id, topic)}"]`,
  )!;
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
