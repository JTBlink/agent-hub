// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { Project } from "../../lib/tauri";
import * as api from "../../lib/tauri";
import { SidebarHerdr } from "./SidebarHerdr";

const app = vi.hoisted(() => {
  const projects: Project[] = [];
  return {
    projects,
    tools: [],
    refreshProjects: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock("../../context/AppContext", () => ({ useApp: () => app }));
vi.mock("../../hooks/useActiveWorkspace", () => ({
  useActiveWorkspace: () => ({
    project: app.projects[0],
    path: app.projects[0]?.path,
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../lib/tauri", async (original) => ({
  ...(await original<typeof import("../../lib/tauri")>()),
  getHerdrInventory: vi.fn(),
  getHerdrSnapshot: vi.fn(),
  openHerdrWorkspace: vi.fn(),
  ensureHerdrWorkspace: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(api.getHerdrInventory).mockResolvedValue({
    installed: true,
    sessions: [{ name: "default", default: true, running: true }],
  });
  vi.mocked(api.getHerdrSnapshot).mockResolvedValue({
    version: "0.9.3",
    workspaces: [],
    tabs: [],
    panes: [],
    agents: [],
  });
});
function Location() {
  const l = useLocation();
  return <output>{l.pathname + l.search}</output>;
}

it("opens the checkout returned by Herdr and navigates with an explicit attachment", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  localStorage.clear();
  vi.mocked(api.getHerdrInventory).mockResolvedValue({
    installed: true,
    sessions: [{ name: "default", running: true, default: true }],
  });
  vi.mocked(api.getHerdrSnapshot).mockResolvedValue({
    version: "0.9.3",
    workspaces: [
      {
        workspace_id: "w1",
        label: "Same label",
        active_tab_id: "w1:t1",
        directory: "/projects/second",
        branch: "main",
      },
    ],
    tabs: [],
    panes: [],
    agents: [],
  });
  vi.mocked(api.openHerdrWorkspace).mockResolvedValue({
    project_id: "opened-project",
    path: "/projects/second",
    target: {
      session: "default",
      workspace_id: "w1",
      pane_id: "w1:p1",
      terminal_id: "pty-1",
      revision: 1,
      agent_session: null,
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <SidebarHerdr active onHide={() => {}} />
          <Location />
        </MemoryRouter>,
      ),
    );
    const button = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Same label"),
    );
    expect(button).toBeTruthy();
    await act(async () => button!.click());
    expect(app.refreshProjects).toHaveBeenCalled();
    expect(host.querySelector("output")?.textContent).toBe(
      "/project/opened-project?worktree=%2Fprojects%2Fsecond",
    );
    expect(api.openHerdrWorkspace).toHaveBeenCalledWith(
      "default",
      "w1",
      undefined,
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("does not navigate back when an earlier open-current request finishes after changing routes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const { makeProject } = await import("../../../tests/fixtures/workspace");
  app.projects.push({ ...makeProject(), path: "/projects/demo" });
  let finish!: (opened: api.HerdrOpenedWorkspace) => void;
  vi.mocked(api.ensureHerdrWorkspace).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/project/demo"]}>
          <SidebarHerdr active onHide={() => {}} />
          <Link to="/project/other" data-next>
            Other
          </Link>
          <Location />
        </MemoryRouter>,
      ),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="herdr.openCurrent"]')!
        .click(),
    );
    expect(api.ensureHerdrWorkspace).toHaveBeenCalledWith(
      "default",
      "demo",
      "/projects/demo",
    );
    await act(async () =>
      host.querySelector<HTMLAnchorElement>("[data-next]")!.click(),
    );
    await act(async () =>
      finish({
        project_id: "demo",
        path: "/projects/demo",
        target: {
          session: "default",
          workspace_id: "w1",
          pane_id: "w1:p1",
          terminal_id: "native",
          revision: 1,
          agent_session: null,
        },
      }),
    );
    expect(host.querySelector("output")?.textContent).toBe("/project/other");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    app.projects.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
