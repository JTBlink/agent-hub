// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Layout } from "./Layout";
import type { TerminalStartupState } from "./terminal/useTerminalLayout";

const state = vi.hoisted(() => ({
  loading: true,
  appError: null as string | null,
  refreshAppData: vi.fn(),
  refreshProjects: vi.fn(),
  startup: { ready: false, error: "", retry: vi.fn() },
  destination: "/",
  dashboardMounts: 0,
}));
vi.mock("../context/AppContext", () => ({ useApp: () => state }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../hooks/useApplicationMenu", () => ({
  useApplicationMenu: () => {},
}));
vi.mock("./Sidebar", () => ({ Sidebar: () => null }));
vi.mock("./WindowTitleBar", () => ({ WindowTitleBar: () => null }));
vi.mock("./statusbar/WorkbenchStatusBar", () => ({
  WorkbenchStatusBar: () => null,
}));
vi.mock("./AddProjectDialog", () => ({ AddProjectDialog: () => null }));
vi.mock("./CommandPalette", () => ({ CommandPalette: () => null }));
vi.mock("./worktree/WorkspaceFilesContext", () => ({
  WorkspaceFilesProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("./worktree/ProjectWorkspace", () => ({
  ProjectWorkspace: ({
    onStartupStateChange,
  }: {
    onStartupStateChange: (state: TerminalStartupState) => void;
  }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const startup = state.startup;
    const destination = state.destination;
    useEffect(() => {
      // Model the real restoration order: commit readiness and route replacement together.
      onStartupStateChange({
        ...startup,
        ready:
          startup.ready &&
          (destination === "/" || location.pathname === destination),
      });
      if (
        startup.ready &&
        destination !== "/" &&
        location.pathname !== destination
      )
        navigate(destination, { replace: true });
    }, [
      onStartupStateChange,
      navigate,
      startup,
      destination,
      location.pathname,
    ]);
    return null;
  },
}));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(state, {
    loading: true,
    appError: null,
    startup: { ready: false, error: "", retry: vi.fn() },
    destination: "/",
    dashboardMounts: 0,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function Dashboard() {
  useEffect(() => {
    state.dashboardMounts++;
  }, []);
  return <p>Dashboard</p>;
}
async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/project/demo" element={<Outlet />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    ),
  );
}
it("waits for app data and terminal reconciliation before mounting the dashboard", async () => {
  await render();
  expect(host.querySelector('[role="status"]')?.textContent).toContain(
    "common.loading",
  );
  expect(state.dashboardMounts).toBe(0);
  state.loading = false;
  await render();
  expect(state.dashboardMounts).toBe(0);
  state.startup = { ...state.startup, ready: true };
  await render();
  expect(state.dashboardMounts).toBe(1);
  expect(host.querySelector('[role="status"]')).toBeNull();
  state.loading = true;
  await render();
  expect(state.dashboardMounts).toBe(1);
  expect(host.querySelector('[role="status"]')).toBeNull();
});
it("restores the project without ever mounting the dashboard", async () => {
  await render();
  state.loading = false;
  state.destination = "/project/demo";
  state.startup = { ...state.startup, ready: true };
  await render();
  expect(state.dashboardMounts).toBe(0);
  expect(host.querySelector('[role="status"]')).toBeNull();
});
it("offers retry on startup failure without mounting the dashboard", async () => {
  state.loading = false;
  state.startup = { ...state.startup, error: "Cannot read terminal sessions" };
  await render();
  expect(host.textContent).toContain("Cannot read terminal sessions");
  expect(state.dashboardMounts).toBe(0);
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[role="alert"] button')?.click(),
  );
  expect(state.startup.retry).toHaveBeenCalledOnce();
  state.startup = { ...state.startup, error: "", ready: true };
  await render();
  expect(state.dashboardMounts).toBe(1);
});
