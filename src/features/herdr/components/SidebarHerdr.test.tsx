// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { Project } from "../../../lib/tauri";
import { getSettings, setSettings } from "../../../lib/tauri";
import * as api from "../api";
import { SidebarHerdr } from "./SidebarHerdr";

const app = vi.hoisted(() => {
  const projects: Project[] = [];
  return {
    projects,
    tools: [],
    refreshProjects: vi.fn().mockResolvedValue(undefined),
    missing: false,
    refreshWorktrees: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock("../../../context/AppContext", () => ({ useApp: () => app }));
vi.mock("../../../lib/tauri", async (original) => ({
  ...(await original<typeof import("../../../lib/tauri")>()),
  getSettings: vi.fn(),
  setSettings: vi.fn(),
}));
vi.mock("../../../hooks/useActiveWorkspace", () => ({
  useActiveWorkspace: () => ({
    project: app.projects[0],
    path: app.projects[0]?.path,
  }),
}));
vi.mock("../../../hooks/useProjectWorktrees", () => ({
  useProjectWorktrees: (projectId?: string) => ({
    worktrees: app.projects
      .filter((project) => project.id === projectId)
      .map((project) => ({
        path: project.path,
        is_main: true,
        available: !app.missing || project.id !== app.projects[0]?.id,
      })),
    loading: false,
    error: "",
    refresh: app.refreshWorktrees,
  }),
}));
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../api", async (original) => ({
  ...(await original<typeof import("../api")>()),
  getHerdrInventory: vi.fn(),
  getHerdrSnapshot: vi.fn(),
  refreshHerdrWorktrees: vi.fn(),
  openHerdrWorkspace: vi.fn(),
  ensureHerdrWorkspace: vi.fn(),
  installHerdr: vi.fn(),
  prepareHerdrSession: vi.fn(),
  deleteHerdrSession: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  app.missing = false;
  vi.mocked(getSettings).mockResolvedValue(null);
  vi.mocked(setSettings).mockResolvedValue(undefined);
  vi.mocked(api.prepareHerdrSession).mockResolvedValue("default");
  vi.mocked(api.refreshHerdrWorktrees).mockResolvedValue({
    version: "test",
    workspaces: [],
    tabs: [],
    panes: [],
    agents: [],
  });
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

it("refreshes native worktrees only on manual refresh without opening or focusing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.clearAllMocks();
  const { makeProject } = await import("../../../../tests/fixtures/workspace");
  app.projects.push({ ...makeProject(), path: "/projects/demo" });
  const host = document.createElement("div");
  const root = createRoot(host);
  const render = () =>
    root.render(
      <MemoryRouter>
        <SidebarHerdr active />
      </MemoryRouter>,
    );
  try {
    await act(async () => render());
    expect(api.prepareHerdrSession).not.toHaveBeenCalled();
    expect(api.ensureHerdrWorkspace).not.toHaveBeenCalled();
    expect(api.refreshHerdrWorktrees).not.toHaveBeenCalled();
    app.projects[0] = {
      ...app.projects[0],
      id: "other",
      path: "/projects/other",
    };
    await act(async () => render());
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="common.refresh"]')!
        .click(),
    );
    expect(api.getHerdrSnapshot).toHaveBeenCalled();
    expect(api.refreshHerdrWorktrees).toHaveBeenCalledExactlyOnceWith(
      "default",
    );
    expect(app.refreshWorktrees).not.toHaveBeenCalled();
    expect(api.prepareHerdrSession).not.toHaveBeenCalled();
    expect(api.ensureHerdrWorkspace).not.toHaveBeenCalled();
    expect(api.openHerdrWorkspace).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    app.projects.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("opens full-sidebar settings, saves opt-in, coalesces project changes and stops following when disabled", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.useFakeTimers();
  const { makeProject } = await import("../../../../tests/fixtures/workspace");
  app.projects.push({ ...makeProject(), path: "/projects/demo" });
  const stored = new Map<string, string>();
  vi.mocked(getSettings).mockImplementation(
    async (key) => stored.get(key) ?? null,
  );
  vi.mocked(setSettings).mockImplementation(async (key, value) => {
    stored.set(key, value);
  });
  vi.mocked(api.ensureHerdrWorkspace).mockImplementation(
    async (session, projectId, path) => ({
      project_id: projectId,
      path: path!,
      target: {
        session,
        workspace_id: "w1",
        pane_id: "w1:p1",
        terminal_id: "native",
        revision: 1,
        agent_session: null,
      },
    }),
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let panelRequest: { id: number; panel: string; view: string } | undefined;
  const render = () =>
    root.render(
      <MemoryRouter>
        <SidebarHerdr active request={panelRequest} />
      </MemoryRouter>,
    );
  const click = (selector: string) =>
    act(async () => host.querySelector<HTMLButtonElement>(selector)!.click());
  const openSettings = async () => {
    await click('[aria-label="herdr.moreActions"]');
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find((button) => button.textContent === "herdr.settings")!
        .click(),
    );
  };
  try {
    await act(async () => render());
    await openSettings();
    expect(host.querySelector("section[aria-labelledby]")).toBeTruthy();
    expect(
      host.querySelector<HTMLDivElement>('[aria-label="Herdr"]')?.hidden,
    ).toBe(true);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(
      host.querySelector('[role="switch"]')?.getAttribute("aria-checked"),
    ).toBe("false");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "common.back",
    );
    await click('[role="switch"]');
    expect(stored.get("herdr_follow_project")).toBe("true");
    // A rapid intermediate checkout must never steal focus.
    app.projects[0] = { ...app.projects[0], path: "/projects/intermediate" };
    await act(async () => render());
    app.projects[0] = { ...app.projects[0], path: "/projects/feature" };
    await act(async () => render());
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(api.ensureHerdrWorkspace).toHaveBeenCalledExactlyOnceWith(
      "default",
      "demo",
      "/projects/feature",
    );
    await click('[aria-label="common.back"]');
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "herdr.moreActions",
    );
    await click('[aria-label="common.refresh"]');
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(api.ensureHerdrWorkspace).toHaveBeenCalledOnce();
    await openSettings();
    vi.mocked(setSettings).mockRejectedValueOnce(new Error("failed"));
    await click('[role="switch"]');
    expect(
      host.querySelector('[role="switch"]')?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(host.querySelector('[role="alert"]')).toBeTruthy();
    await click('[role="switch"]');
    expect(stored.get("herdr_follow_project")).toBe("false");
    app.projects[0] = { ...app.projects[0], path: "/projects/next" };
    await act(async () => render());
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(api.ensureHerdrWorkspace).toHaveBeenCalledOnce();
    // A new sidebar reads the persisted preference, rather than enabling itself.
    await act(async () => root.render(null));
    await act(async () => render());
    await openSettings();
    expect(
      host.querySelector('[role="switch"]')?.getAttribute("aria-checked"),
    ).toBe("false");
    await click('[aria-label="common.back"]');
    panelRequest = { id: 1, panel: "herdr", view: "settings" };
    await act(async () => render());
    expect(
      host.querySelector<HTMLDivElement>('[aria-label="Herdr"]')?.hidden,
    ).toBe(true);
    await click('[aria-label="common.back"]');
    await act(async () => render());
    expect(
      host.querySelector<HTMLDivElement>('[aria-label="Herdr"]')?.hidden,
    ).toBe(false);
    panelRequest = { ...panelRequest, id: 2 };
    await act(async () => render());
    expect(
      host.querySelector<HTMLDivElement>('[aria-label="Herdr"]')?.hidden,
    ).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    app.projects.length = 0;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

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
    const button = host.querySelector<HTMLButtonElement>(
      '[data-herdr-workspace="w1"]',
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
  const { makeProject } = await import("../../../../tests/fixtures/workspace");
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

it("keeps other workspaces usable while showing friendly recovery for a deleted project", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const { makeProject } = await import("../../../../tests/fixtures/workspace");
  app.projects.push({
    ...makeProject(),
    id: "missing-herdr-project",
    path: "/projects/missing",
  });
  app.missing = true;
  const ensured = vi.mocked(api.ensureHerdrWorkspace).mock.calls.length;
  vi.mocked(api.getHerdrSnapshot).mockResolvedValue({
    version: "test",
    workspaces: [
      {
        workspace_id: "other",
        label: "Other workspace",
        directory: "/projects/other",
        active_tab_id: "",
        branch: "main",
      },
    ],
    tabs: [],
    panes: [],
    agents: [],
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/project/missing-herdr-project"]}>
          <SidebarHerdr active />
        </MemoryRouter>,
      ),
    );
    expect(host.textContent).toContain("worktree.missingDirectory.title");
    expect(host.textContent).not.toContain("os error");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    const other = host.querySelector<HTMLButtonElement>(
      '[data-herdr-workspace="other"]',
    )!;
    expect(other).not.toBeNull();
    expect(other.disabled).toBe(false);
    expect(api.ensureHerdrWorkspace).toHaveBeenCalledTimes(ensured);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    app.projects.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
