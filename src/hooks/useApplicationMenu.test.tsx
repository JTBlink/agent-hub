// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { useApplicationMenu } from "./useApplicationMenu";
import { makeProject } from "../../tests/fixtures/workspace";
vi.mock("./useProjectWorktrees", () => ({ cacheProjectWorktrees: vi.fn() }));
const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined),
  install: vi.fn().mockResolvedValue({
    close: vi.fn().mockResolvedValue(undefined),
    setAsAppMenu: vi.fn().mockResolvedValue(null),
    setAsWindowMenu: vi.fn().mockResolvedValue(null),
  }),
  actions: null as null | { openProject: () => void },
  error: vi.fn(),
}));
const t = (key: string) => key;
const projects: never[] = [];
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: "main",
    onFocusChanged: vi.fn().mockResolvedValue(() => {}),
    isFocused: vi.fn().mockResolvedValue(true),
  }),
}));
vi.mock("../context/AppContext", () => ({
  useApp: () => ({ projects, refreshProjects: mocks.refresh }),
}));
vi.mock("../lib/openProject", () => ({ openProjectFolder: mocks.open }));
vi.mock("../lib/applicationMenu", () => ({
  applicationMenuOptions: (
    _t: unknown,
    _projects: unknown,
    actions: { openProject: () => void },
  ) => {
    mocks.actions = actions;
    return {};
  },
  installApplicationMenu: mocks.install,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
function Harness() {
  useApplicationMenu(
    () => {},
    () => {},
  );
  const location = useLocation();
  return <output>{location.pathname + location.search}</output>;
}
it("opens one folder picker at a time and enters the automatically associated project", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const project = { ...makeProject(), id: "opened-project" };
  const opened = { project, directory: project.path, visits: [] };
  let resolve: (value: typeof opened) => void = () => {};
  mocks.open.mockReturnValue(
    new Promise<typeof opened>((done) => {
      resolve = done;
    }),
  );
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <Harness />
        </MemoryRouter>,
      ),
    );
    await act(async () => {
      mocks.actions!.openProject();
      mocks.actions!.openProject();
    });
    expect(mocks.open).toHaveBeenCalledOnce();
    await act(async () => {
      resolve(opened);
    });
    expect(mocks.refresh).toHaveBeenCalledWith(project);
    expect(host.textContent).toBe(
      `/project/${project.id}?${new URLSearchParams({ worktree: project.path })}`,
    );
    expect(mocks.error).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
