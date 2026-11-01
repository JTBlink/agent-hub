// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { makeProject } from "../../../tests/fixtures/workspace";
import { WorkspaceFilesProvider } from "../worktree/WorkspaceFilesContext";
import { useWorkspaceFiles } from "../../hooks/useWorkspaceFiles";
import {
  searchWorktree,
  replaceWorktreeMatches,
  type WorktreeSearchResult,
} from "../../lib/worktreeSearchApi";
import { WorkspaceSearch } from "./WorkspaceSearch";

const project = makeProject();
const topic = "<workspace>/topic";
const t = (key: string) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../../context/AppContext", () => ({
  useApp: () => ({ projects: [project] }),
}));
vi.mock("../../hooks/useProjectWorktrees", () => ({
  useProjectWorktrees: () => ({
    worktrees: [
      { path: project.path, is_main: true, available: true, branch: "main" },
      { path: topic, is_main: false, available: true, branch: "topic" },
    ],
    loading: false,
    error: "",
    refresh: vi.fn(),
  }),
}));
vi.mock("../../lib/worktreeSearchApi", () => ({
  searchWorktree: vi.fn(),
  replaceWorktreeMatches: vi.fn(),
}));
let host: HTMLDivElement;
let root: Root;
const found: WorktreeSearchResult = {
  files: [
    {
      path: "src/demo.ts",
      fingerprint: "fingerprint",
      matches: [
        {
          line: 2,
          column: 4,
          end_column: 10,
          preview: "😀 needle",
          preview_start: 1,
        },
      ],
    },
  ],
  count: 1,
  truncated: false,
  skipped: 0,
};
function Capture() {
  const { files, setCheckout } = useWorkspaceFiles();
  const route = useLocation();
  return (
    <>
      <button
        data-remember
        onClick={() =>
          setCheckout({ projectId: project.id, worktreePath: topic })
        }
      >
        Remember
      </button>
      <output>{JSON.stringify({ files, path: route.pathname })}</output>
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(searchWorktree).mockResolvedValue(found);
  vi.mocked(replaceWorktreeMatches).mockResolvedValue({
    replaced: 1,
    files: 1,
    errors: [],
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter
        initialEntries={[`/project/demo?worktree=${encodeURIComponent(topic)}`]}
      >
        <WorkspaceFilesProvider>
          <Link data-main to="/project/demo">
            Main
          </Link>
          <Link data-other to="/git">
            Other page
          </Link>
          <WorkspaceSearch active onHide={() => {}} />
          <Capture />
        </WorkspaceFilesProvider>
      </MemoryRouter>,
    ),
  );
}
async function fill(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function tick() {
  await act(async () => vi.advanceTimersByTimeAsync(300));
}
async function click(selector: string) {
  await act(async () => host.querySelector<HTMLElement>(selector)!.click());
}

it("searches only the current checkout and opens a result at its UTF-16 position", async () => {
  await render();
  await fill("[data-workspace-search-input]", "needle");
  await tick();
  expect(searchWorktree).toHaveBeenLastCalledWith(
    project.id,
    topic,
    expect.objectContaining({ query: "needle", case_sensitive: false }),
  );
  expect(host.querySelector("mark")?.textContent).toBe("needle");
  await click('button[aria-label="workspaceSearch.matchCase"]');
  await tick();
  expect(searchWorktree).toHaveBeenLastCalledWith(
    project.id,
    topic,
    expect.objectContaining({ case_sensitive: true }),
  );
  await click('button[aria-label="workspaceSearch.openMatch"]');
  const capture = JSON.parse(host.querySelector("output")!.textContent!);
  expect(capture.path).toBe("/project/demo");
  expect(capture.files[JSON.stringify([project.id, topic])]).toEqual({
    path: "src/demo.ts",
    shown: true,
    location: { line: 2, column: 4, endColumn: 10 },
  });
});

it("discards older worktree results and keeps query modes separate", async () => {
  let finish!: (value: WorktreeSearchResult) => void;
  vi.mocked(searchWorktree).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await render();
  await fill("[data-workspace-search-input]", "needle");
  await tick();
  await click("[data-main]");
  await tick();
  expect(searchWorktree).toHaveBeenLastCalledWith(
    project.id,
    project.path,
    expect.anything(),
  );
  await act(async () =>
    finish({ ...found, files: [{ ...found.files[0], path: "old-scope.ts" }] }),
  );
  expect(host.textContent).not.toContain("old-scope.ts");
  await click('button[aria-label="workspaceSearch.filters"]');
  await fill('input[aria-label="workspaceSearch.include"]', "src/**");
  await tick();
  expect(searchWorktree).toHaveBeenLastCalledWith(
    project.id,
    project.path,
    expect.objectContaining({ include: "src/**" }),
  );
});

it("confirms replacements against search fingerprints and retains failed inputs", async () => {
  await render();
  await fill("[data-workspace-search-input]", "needle");
  await tick();
  await click('button[aria-label="workspaceSearch.toggleReplace"]');
  await fill('input[aria-label="workspaceSearch.replacement"]', "updated");
  vi.mocked(replaceWorktreeMatches).mockRejectedValueOnce(
    new Error("File changed on disk"),
  );
  await click('button[aria-label="workspaceSearch.replaceAll"]');
  expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
  const confirm = [
    ...host.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'),
  ].find((button) => button.textContent === "workspaceSearch.replaceAll")!;
  await act(async () => confirm.click());
  expect(replaceWorktreeMatches).toHaveBeenLastCalledWith(
    project.id,
    topic,
    expect.objectContaining({ query: "needle" }),
    "updated",
    found.files,
  );
  expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(host.textContent).toContain("File changed on disk");
  expect(
    host.querySelector<HTMLInputElement>(
      'input[aria-label="workspaceSearch.replacement"]',
    )!.value,
  ).toBe("updated");
  await act(async () => confirm.click());
  expect(host.querySelector('[role="alertdialog"]')).toBeNull();
});

it("disables replacement for incomplete search results", async () => {
  vi.mocked(searchWorktree).mockResolvedValue({ ...found, truncated: true });
  await render();
  await fill("[data-workspace-search-input]", "needle");
  await tick();
  await click('button[aria-label="workspaceSearch.toggleReplace"]');
  expect(
    host.querySelector<HTMLButtonElement>(
      'button[aria-label="workspaceSearch.replaceAll"]',
    )!.disabled,
  ).toBe(true);
  expect(host.textContent).toContain("workspaceSearch.truncated");
});

it("keeps the active checkout when search opens from another workbench page", async () => {
  await render();
  await click("[data-remember]");
  await click("[data-other]");
  await fill("[data-workspace-search-input]", "needle");
  await tick();
  expect(searchWorktree).toHaveBeenLastCalledWith(
    project.id,
    topic,
    expect.objectContaining({ query: "needle" }),
  );
});
