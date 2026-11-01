// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getProjectGitStatus, type GitStatus } from "../lib/gitApi";
import { useGitChangeCount } from "./useGitChangeCount";
import { SidebarActivityBar } from "../components/SidebarActivityBar";
vi.mock("../lib/gitApi", () => ({ getProjectGitStatus: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count: number }) =>
      `${key}${options ? ` ${options.count}` : ""}`,
  }),
}));
let root: Root;
let host: HTMLDivElement;
const hidden = Object.getOwnPropertyDescriptor(document, "hidden");
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  vi.mocked(getProjectGitStatus).mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  if (hidden) Object.defineProperty(document, "hidden", hidden);
  else Reflect.deleteProperty(document, "hidden");
  vi.unstubAllGlobals();
});
function status(paths: string[]): GitStatus {
  return {
    branch: "main",
    head: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    state: "Clean",
    truncated: false,
    commits: [],
    files: paths.map((path) => ({
      path,
      staged: false,
      unstaged: true,
      conflicted: false,
      status: "modified",
    })),
  };
}
function Count({ projectId }: { projectId: string }) {
  const result = useGitChangeCount(projectId, `<workspace>/${projectId}`);
  return <output>{result?.count ?? "unknown"}</output>;
}
it("matches the sum of staged and unstaged counts including files in both groups", async () => {
  const snapshot = status(
    Array.from({ length: 43 }, (_, index) => `file-${index}.ts`),
  );
  snapshot.files.forEach((file, index) => {
    file.staged = index < 15;
    file.unstaged = index >= 10;
  });
  vi.mocked(getProjectGitStatus)
    .mockResolvedValueOnce(snapshot)
    .mockResolvedValueOnce(status([]));
  await act(async () => root.render(<Count projectId="demo" />));
  expect(host.textContent).toBe("48");
  await act(async () => window.dispatchEvent(new Event("project-git-changed")));
  expect(host.textContent).toBe("0");
});
it("does not show another checkout's late result and clears failed counts", async () => {
  let finish!: (value: GitStatus) => void;
  vi.mocked(getProjectGitStatus)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValueOnce(status(["new.ts"]))
    .mockRejectedValueOnce(new Error("Unavailable"));
  await act(async () => root.render(<Count projectId="old" />));
  await act(async () => root.render(<Count projectId="new" />));
  await act(async () => finish(status(["old.ts", "other.ts"])));
  expect(host.textContent).toBe("1");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(host.textContent).toBe("unknown");
});
it("shows the Git badge on other pages and hides it for a clean checkout", async () => {
  const render = (count: number) => (
    <MemoryRouter initialEntries={["/tasks"]}>
      <SidebarActivityBar
        panelOpen={false}
        panelId="resources"
        gitSidebarOpen
        onSelectGit={vi.fn()}
        selectedPanel="projects"
        manualSelection={false}
        onSelectPanel={vi.fn()}
        gitChanges={{ count, truncated: false }}
      />
    </MemoryRouter>
  );
  await act(async () => root.render(render(37)));
  const link = host.querySelector('a[href="/git"]')!;
  expect(link.querySelector('[role="status"]')?.textContent).toBe("37");
  expect(
    link.querySelector('[role="status"]')?.getAttribute("aria-label"),
  ).toBe("git.changedFiles 37");
  await act(async () => root.render(render(0)));
  expect(link.querySelector('[role="status"]')).toBeNull();
});
