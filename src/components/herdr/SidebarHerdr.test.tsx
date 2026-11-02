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
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../lib/tauri", async (original) => ({
  ...(await original<typeof import("../../lib/tauri")>()),
  getHerdrInventory: vi.fn(),
  getHerdrSnapshot: vi.fn(),
  openHerdrWorkspace: vi.fn(),
  ensureHerdrWorkspace: vi.fn(),
  installHerdr: vi.fn(),
  prepareHerdrSession: vi.fn(),
  deleteHerdrSession: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(api.prepareHerdrSession).mockResolvedValue("default");
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
          <SidebarHerdr active />
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
          <SidebarHerdr active />
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

it("filters workspaces by selection and restores all entries", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  localStorage.clear();
  vi.mocked(api.getHerdrSnapshot).mockResolvedValue({
    version: "0.9.3",
    tabs: [],
    panes: [],
    agents: [],
    workspaces: ["first", "second"].map((name) => ({
      workspace_id: name,
      label: name,
      active_tab_id: `${name}:t1`,
      directory: `/projects/${name}`,
      branch: "main",
    })),
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <SidebarHerdr active />
        </MemoryRouter>,
      ),
    );
    const picker = host.querySelector<HTMLButtonElement>(
      '[role="combobox"][aria-label="herdr.filterWorkspace"]',
    )!;
    await act(async () => picker.click());
    const option = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ].find((o) => o.textContent?.includes("second"))!;
    await act(async () => option.click());
    expect(host.querySelector('[data-herdr-workspace="first"]')).toBeNull();
    expect(host.querySelector('[data-herdr-workspace="second"]')).toBeTruthy();
    await act(async () => picker.click());
    const all = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ].find((o) => o.textContent === "herdr.allWorkspaces")!;
    await act(async () => all.click());
    expect(host.querySelectorAll("[data-herdr-workspace]")).toHaveLength(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("guides installation inside the Herdr panel when the tool is missing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  vi.mocked(api.getHerdrInventory).mockResolvedValue({
    installed: false,
    sessions: [],
  });
  vi.mocked(api.installHerdr).mockResolvedValue({
    path: "/tools/herdr",
    version: "1.2.3",
    managed: true,
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <SidebarHerdr active />
        </MemoryRouter>,
      ),
    );
    expect(host.textContent).toContain("herdr.missing");
    const install = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "herdr.install",
    )!;
    await act(async () => install.click());
    expect(api.installHerdr).toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it.each([true, false])(
  "selects and deletes extra sessions (running: %s) while protecting default and retaining failed deletions",
  async (running) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    vi.mocked(api.prepareHerdrSession).mockResolvedValue("default");
    vi.mocked(api.getHerdrInventory).mockResolvedValue({
      installed: true,
      sessions: [
        { name: "default", running: true, default: true },
        { name: "agent-hub", running, default: false },
      ],
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <MemoryRouter>
            <SidebarHerdr active />
          </MemoryRouter>,
        ),
      );
      const picker = host.querySelector<HTMLButtonElement>(
        '[role="combobox"][aria-label="herdr.session"]',
      )!;
      const deleteButton = () =>
        host.querySelector<HTMLButtonElement>(
          '[aria-label="herdr.deleteSession"]',
        )!;
      expect(deleteButton().disabled).toBe(true);
      expect(api.getHerdrSnapshot).toHaveBeenLastCalledWith("default");
      await act(async () => picker.click());
      await act(async () =>
        [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
          .find((o) => o.textContent?.startsWith("agent-hub"))!
          .click(),
      );
      expect(api.getHerdrSnapshot).toHaveBeenLastCalledWith(
        running ? "agent-hub" : "default",
      );
      expect(deleteButton().disabled).toBe(false);
      await act(async () => deleteButton().click());
      const confirm = () =>
        [
          ...host.querySelectorAll<HTMLButtonElement>(
            '[role="alertdialog"] button',
          ),
        ].find((b) => b.textContent === "common.delete")!;
      vi.mocked(api.deleteHerdrSession).mockRejectedValueOnce(
        new Error("Delete failed"),
      );
      await act(async () => confirm().click());
      expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain(
        "Delete failed",
      );
      vi.mocked(api.deleteHerdrSession).mockResolvedValueOnce(undefined);
      vi.mocked(api.getHerdrInventory).mockResolvedValue({
        installed: true,
        sessions: [{ name: "default", running: true, default: true }],
      });
      await act(async () => confirm().click());
      expect(api.deleteHerdrSession).toHaveBeenLastCalledWith("agent-hub");
      expect(host.querySelector('[role="alertdialog"]')).toBeNull();
      expect(picker.textContent).toContain("default");
      expect(deleteButton().disabled).toBe(true);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  },
);
