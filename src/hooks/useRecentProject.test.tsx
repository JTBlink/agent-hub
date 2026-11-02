// @vitest-environment jsdom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRecentProject } from "./useRecentProject";
import { makeProject } from "../../tests/fixtures/workspace";
vi.mock("./useProjectWorktrees", () => ({ cacheProjectWorktrees: vi.fn() }));

const mocks = vi.hoisted(() => ({
  worktrees: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  visit: vi.fn(),
  error: vi.fn(),
}));
const project = makeProject();
vi.mock("../context/AppContext", () => ({
  useApp: () => ({ projects: [project], refreshProjects: mocks.refresh }),
}));
vi.mock("../lib/tauri", () => ({
  removeProject: mocks.remove,
  touchProjectVisited: mocks.visit,
}));
vi.mock("../lib/worktreeApi", async (original) => ({
  ...(await original<typeof import("../lib/worktreeApi")>()),
  getProjectWorktrees: mocks.worktrees,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
let controls: ReturnType<typeof useRecentProject>;
let root: Root;
let host: HTMLDivElement;
function Harness() {
  const recent = useRecentProject();
  useLayoutEffect(() => {
    controls = recent;
  });
  const location = useLocation();
  return <output>{location.pathname}</output>;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.worktrees.mockResolvedValue([{ path: project.path, available: false }]);
  mocks.remove.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(undefined);
  mocks.visit.mockResolvedValue(undefined);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(path = `/project/${project.id}`) {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Harness />
      </MemoryRouter>,
    ),
  );
}

it("asks before removing an unavailable recent project, cancels safely and returns to welcome after confirmation", async () => {
  await render();
  await act(async () => controls.openRecent(project));
  expect(controls.missingProject).toEqual(project);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.visit).not.toHaveBeenCalled();
  await act(async () => controls.dismissMissingProject());
  expect(controls.missingProject).toBeNull();
  expect(mocks.remove).not.toHaveBeenCalled();
  await act(async () => controls.openRecent(project));
  await act(async () => controls.removeMissingProject());
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(project.id);
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(host.textContent).toBe("/");
});

it("opens a recovered project instead of removing it and preserves the confirmation when removal fails", async () => {
  await render();
  await act(async () => controls.openRecent(project));
  mocks.remove.mockRejectedValueOnce(new Error("database unavailable"));
  await act(async () => controls.removeMissingProject());
  expect(controls.missingProject).toEqual(project);
  expect(controls.removalError).toBe("worktree.missingDirectory.removeFailed");
  mocks.worktrees.mockResolvedValue([{ path: project.path, available: true }]);
  await act(async () => controls.removeMissingProject());
  expect(controls.missingProject).toBeNull();
  expect(mocks.remove).toHaveBeenCalledTimes(1);
  expect(mocks.visit).toHaveBeenCalledWith(project.id);
});

it("does not offer removal when a failed query cannot establish that the directory is missing", async () => {
  await render("/");
  mocks.worktrees.mockRejectedValueOnce(new Error("permission denied"));
  await act(async () => controls.openRecent(project));
  expect(controls.missingProject).toBeNull();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith(
    "worktree.missingDirectory.accessDescription",
  );
});
