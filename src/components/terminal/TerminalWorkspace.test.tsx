// @vitest-environment jsdom
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { Project } from "../../lib/tauri";
import { makeProject, makeTool } from "../../../tests/fixtures/workspace";
import {
  createTerminalTab,
  writeTerminalLayout,
} from "../../lib/terminalLayout";
import { TerminalWorkspace } from "./TerminalWorkspace";
import { TerminalSessions } from "./TerminalSessions";
import { SidebarVisibilityContext } from "../../hooks/sidebarVisibility";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@xterm/xterm", async () => ({
  Terminal: (await import("../../test/terminalEmulator")).TerminalEmulator,
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class {
    onContextLoss() {}
    dispose() {}
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), Channel: class {} }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
beforeEach(() => {
  localStorage.clear();
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === "terminal_list" ? [] : undefined,
  );
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function openNew(host: HTMLElement, label = "terminal.new") {
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="terminal.newMenu"]')!
      .click(),
  );
  const item = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ].find((item) => item.textContent === label)!;
  await act(async () => item.click());
}

it("attaches the explicitly opened Herdr checkout without creating an extra Shell", async () => {
  const project = {
    ...makeProject(),
    id: "herdr-project",
    path: "/projects/demo",
  };
  const target = {
    session: "default",
    workspace_id: "w1",
    pane_id: "w1:p1",
    terminal_id: "native-1",
    revision: 1,
    agent_session: null,
  };
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === "terminal_list"
      ? []
      : command === "herdr_terminal_create"
        ? {
            id: "herdr-pty",
            cwd: project.path,
            project_id: project.id,
            exited: false,
          }
        : undefined,
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: `/project/${project.id}`,
              search: "?worktree=%2Fprojects%2Fdemo",
              state: {
                herdrAttachment: {
                  project_id: project.id,
                  path: project.path,
                  target,
                },
              },
            },
          ]}
        >
          <TerminalWorkspace projects={[project]} />
        </MemoryRouter>,
      ),
    );
    expect(invoke).toHaveBeenCalledWith(
      "herdr_terminal_create",
      expect.objectContaining({
        request: expect.objectContaining({
          project_id: project.id,
          worktree_path: project.path,
          target,
        }),
      }),
    );
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === "terminal_create"),
    ).toHaveLength(0);
    expect(
      host.querySelector('[aria-label="herdr.terminalTools"]'),
    ).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("dismisses the session overview with Escape and outside clicks", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <TerminalSessions
          tabs={[]}
          projects={[]}
          activeId=""
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />,
      ),
    );
    const trigger = host.querySelector("button")!;
    await act(async () => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const overview = document.querySelector(
      '[aria-label="terminal.sessionsOverview"]',
    )!;
    await act(async () =>
      overview.dispatchEvent(new Event("pointerdown", { bubbles: true })),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await act(async () =>
      overview.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(
      document.querySelector('[aria-label="terminal.sessionsOverview"]'),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    await act(async () =>
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(
      document.querySelector('[aria-label="terminal.sessionsOverview"]'),
    ).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("opens the most recently visited project once, after loading and entering the terminal", async () => {
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === "terminal_list"
      ? []
      : command === "terminal_create"
        ? { id: "default-pty", cwd: "<workspace>" }
        : undefined,
  );
  const base: Project = {
    id: "first",
    name: "First",
    path: "<workspace>",
    workspace_type: "project",
    linked_agent_name: null,
    supports_skill_toggle: true,
    sort_order: 0,
    skill_count: 0,
    sync_health: {
      in_sync: 0,
      project_newer: 0,
      center_newer: 0,
      diverged: 0,
      project_only: 0,
    },
    created_at: 0,
    updated_at: 0,
    visited_at: null,
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (projects: Project[]) =>
    root.render(
      <StrictMode>
        <MemoryRouter initialEntries={["/tasks"]}>
          <Link to="/terminal" data-nav="terminal">
            Open
          </Link>
          <Link to="/tasks" data-nav="tasks">
            Tasks
          </Link>
          <TerminalWorkspace projects={projects} />
        </MemoryRouter>
      </StrictMode>,
    );
  const creations = () =>
    vi.mocked(invoke).mock.calls.filter(([name]) => name === "terminal_create");
  const click = async (selector: string) => {
    const element = host.querySelector<HTMLElement>(selector);
    expect(element).not.toBeNull();
    await act(async () => element?.click());
  };
  await act(async () => render([]));
  await click('[data-nav="terminal"]');
  expect(creations()).toHaveLength(0);
  await click('[data-nav="tasks"]');
  await act(async () =>
    render([
      base,
      { ...base, id: "recent", name: "Recent", visited_at: 200 },
      { ...base, id: "older", visited_at: 100 },
    ]),
  );
  expect(creations()).toHaveLength(0);
  await click('[data-nav="terminal"]');
  expect(creations()).toHaveLength(1);
  expect(creations()[0][1]).toMatchObject({ projectId: "recent" });
  expect(host.querySelector('[role="tab"]')?.textContent).toContain("Recent");
  await click('[data-nav="tasks"]');
  await click('[data-nav="terminal"]');
  expect(creations()).toHaveLength(1);
  await click('button[aria-label="terminal.closeTab"]');
  expect(host.querySelector('[role="tab"]')).toBeNull();
  await click('[data-nav="tasks"]');
  await click('[data-nav="terminal"]');
  expect(creations()).toHaveLength(1);
  await act(async () => root.unmount());
  host.remove();
});

it("offers a project terminal without requiring Herdr", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/terminal"]}>
        <TerminalWorkspace projects={[]} />
      </MemoryRouter>,
    ),
  );
  expect(host.textContent).toContain("terminal.chooseProject");
  expect(
    host.querySelector('button[aria-label="terminal.newMenu"]'),
  ).not.toBeNull();
  await act(async () => root.unmount());
  host.remove();
});

it("omits the redundant terminal maximize control", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/terminal"]}>
        <TerminalWorkspace projects={[]} />
      </MemoryRouter>,
    ),
  );
  expect(
    host.querySelector('button[aria-label="terminal.maximize"]'),
  ).toBeNull();
  expect(
    host.querySelector('button[aria-label="terminal.restore"]'),
  ).toBeNull();
  await act(async () => root.unmount());
  host.remove();
});

it("keeps split panes and input intact while Herdr installs and updates", async () => {
  let finishInstall: (value: unknown) => void = () => {};
  let finishUpdate: (value: unknown) => void = () => {};
  let installing = new Promise((resolve) => {
    finishInstall = resolve;
  });
  const updating = new Promise((resolve) => {
    finishUpdate = resolve;
  });
  let created = 0;
  let herdrActive = false;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "terminal_project_directory") return "<workspace>";
    if (command === "terminal_list") return [];
    if (command === "terminal_create")
      return {
        id: `pty-${++created}`,
        project_id: "demo",
        cwd: "<workspace>",
        exited: false,
      };
    if (command === "terminal_launch_state")
      return { ready: true, revision: 0, herdr_active: herdrActive };
    if (command === "herdr_detect") return null;
    if (command === "herdr_install") return installing;
    if (command === "herdr_check_update")
      return { has_update: true, latest_version: "1.2.4", managed: true };
    if (command === "herdr_update") return updating;
    return undefined;
  });
  const project: Project = {
    id: "demo",
    name: "Demo",
    path: "<workspace>",
    workspace_type: "project",
    linked_agent_name: null,
    supports_skill_toggle: true,
    sort_order: 0,
    skill_count: 0,
    sync_health: {
      in_sync: 0,
      project_newer: 0,
      center_newer: 0,
      diverged: 0,
      project_only: 0,
    },
    created_at: 0,
    updated_at: 0,
    visited_at: null,
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/terminal",
            state: {
              projectId: "demo",
              context: {
                key: "task-7",
                title: "Example task",
                url: "https://github.example.invalid/team/demo/issues/7",
                text: "Example task context",
              },
            },
          },
        ]}
      >
        <TerminalWorkspace projects={[project]} />
      </MemoryRouter>,
    ),
  );
  const click = async (label: string) => {
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    expect(button).not.toBeNull();
    await act(async () => button?.click());
  };
  expect(created).toBe(1);
  expect(
    host.querySelector('button[aria-label="tasks.context"]'),
  ).not.toBeNull();
  expect(
    vi
      .mocked(invoke)
      .mock.calls.some(([command]) => command === "terminal_write"),
  ).toBe(false);
  await openNew(host);
  const first = host.querySelector<HTMLTextAreaElement>(
    '[role="tabpanel"]:not([hidden]) textarea[aria-label="Shell input"]',
  );
  expect(first).not.toBeNull();
  await click("common.more");
  const splitOption = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ].find((button) => button.textContent === "terminal.splitHorizontal");
  expect(splitOption).toBeDefined();
  await act(async () => splitOption?.click());
  const panes = host.querySelectorAll<HTMLTextAreaElement>(
    '[role="tabpanel"]:not([hidden]) textarea[aria-label="Shell input"]',
  );
  const second = panes[1];
  expect(second).toBeDefined();
  await selectHerdrAction(host, "terminal.herdrLaunch");
  await act(async () => {
    second.value = "draft";
    second.focus();
    second.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    finishInstall({ path: "<managed>/herdr", version: "1.2.3", managed: true }),
  );
  expect(host.textContent).toContain("terminal.herdrReady");
  expect(
    vi
      .mocked(invoke)
      .mock.calls.some(([command]) => command === "terminal_launch_herdr"),
  ).toBe(false);
  expect(second.value).toBe("draft");
  expect(document.activeElement).toBe(second);
  installing = new Promise((resolve) => {
    finishInstall = resolve;
  });
  await selectHerdrAction(host, "terminal.herdrLaunch");
  const projectControl = host.querySelector<HTMLButtonElement>(
    'button[aria-label="terminal.chooseProject"]',
  );
  await act(async () => projectControl?.focus());
  await act(async () =>
    finishInstall({ path: "<managed>/herdr", version: "1.2.3", managed: true }),
  );
  expect(
    vi
      .mocked(invoke)
      .mock.calls.some(([command]) => command === "terminal_launch_herdr"),
  ).toBe(false);
  expect(document.activeElement).toBe(projectControl);
  await selectHerdrAction(host, "terminal.herdrUpdateAvailable");
  await act(async () =>
    finishUpdate({
      path: "<managed>/new/herdr",
      version: "1.2.4",
      managed: true,
    }),
  );
  expect(second.isConnected).toBe(true);
  expect(second.value).toBe("draft");
  expect(document.activeElement).toBe(projectControl);
  const writesBeforeSidebar = vi
    .mocked(invoke)
    .mock.calls.filter(([command]) => command === "terminal_write").length;
  await selectHerdrAction(host, "terminal.herdrSidebar");
  expect(host.textContent).toContain("terminal.herdrNotRunning");
  expect(
    vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "terminal_write"),
  ).toHaveLength(writesBeforeSidebar);
  herdrActive = true;
  await selectHerdrAction(host, "terminal.herdrSidebar");
  expect(invoke).toHaveBeenCalledWith("terminal_write", {
    id: "pty-3",
    data: "\u0002b",
  });
  expect(document.activeElement).toBe(second);
  await click("terminal.closePane");
  expect(first?.isConnected).toBe(false);
  expect(second.isConnected).toBe(true);
  await act(async () => root.unmount());
  host.remove();
});

it("closes old tabs and splits when switching worktrees and preserves the current checkout on other pages", async () => {
  const { makeProject } = await import("../../../tests/fixtures/workspace");
  const project = makeProject();
  let next = 0;
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "terminal_list") return [];
    if (command === "terminal_create")
      return {
        id: `pty-${++next}`,
        cwd:
          args && typeof args === "object" && "worktreePath" in args
            ? args.worktreePath
            : "<workspace>",
      };
    return undefined;
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const main = `/project/${project.id}?${new URLSearchParams({ worktree: project.path })}`;
  const topicPath = "<workspace>/topic checkout";
  const topic = `/project/${project.id}?${new URLSearchParams({ worktree: topicPath })}`;
  await act(async () =>
    root.render(
      <StrictMode>
        <MemoryRouter initialEntries={[main]}>
          <Link data-nav="main" to={main}>
            Main
          </Link>
          <Link data-nav="topic" to={topic}>
            Topic
          </Link>
          <Link data-nav="skills" to={`/project/${project.id}/skills`}>
            Skills
          </Link>
          <TerminalWorkspace projects={[project]} />
        </MemoryRouter>
      </StrictMode>,
    ),
  );
  const click = async (selector: string) => {
    const node = host.querySelector<HTMLElement>(selector);
    expect(node).not.toBeNull();
    await act(async () => node?.click());
  };
  const inputs = () => [
    ...host.querySelectorAll<HTMLTextAreaElement>(
      '[role="tabpanel"]:not([hidden]) textarea',
    ),
  ];
  const creations = () =>
    vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "terminal_create");
  expect(creations().at(-1)?.[1]).toMatchObject({
    projectId: project.id,
    worktreePath: project.path,
  });
  expect(
    host.querySelector('[aria-label="terminal.chooseProject"]'),
  ).toBeNull();
  await click('[aria-label="common.more"]');
  const option = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((node) => node.textContent === "terminal.splitHorizontal")!;
  await act(async () => option.click());
  const original = inputs();
  expect(original).toHaveLength(2);
  original[1].value = "unfinished command";
  await openNew(host);
  const beforeSwitch = creations().length;
  await click('[data-nav="topic"]');
  expect(inputs()).toHaveLength(1);
  expect(original.every((input) => !input.isConnected)).toBe(true);
  for (let i = 1; i <= beforeSwitch; i++)
    expect(invoke).toHaveBeenCalledWith("terminal_close", { id: `pty-${i}` });
  expect(creations().at(-1)?.[1]).toMatchObject({ worktreePath: topicPath });
  const topicInput = inputs()[0];
  await click('[data-nav="skills"]');
  expect(
    host
      .querySelector('section[aria-label="terminal.title"]')
      ?.hasAttribute("hidden"),
  ).toBe(true);
  await click('[data-nav="topic"]');
  expect(inputs()[0]).toBe(topicInput);
  expect(creations()).toHaveLength(beforeSwitch + 1);
  await click('[data-nav="main"]');
  expect(topicInput.isConnected).toBe(false);
  expect(inputs()).toHaveLength(1);
  expect(inputs()[0].value).toBe("");
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(1);
  expect(creations()).toHaveLength(beforeSwitch + 2);
  await click('[data-nav="topic"]');
  await click('[aria-label="terminal.closeTab"]');
  expect(host.querySelector('[role="tab"]')).toBeNull();
  await click('[data-nav="main"]');
  await click('[data-nav="topic"]');
  expect(inputs()).toHaveLength(1);
  expect(creations()).toHaveLength(beforeSwitch + 5);
  await act(async () => root.unmount());
  host.remove();
});

it("moves terminal status into the window footer and clears it when navigating away", async () => {
  const host = document.createElement("div");
  const statusContainer = document.createElement("div");
  document.body.append(host, statusContainer);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/terminal"]}>
          <SidebarVisibilityContext.Provider
            value={{
              resourcePanelVisible: false,
              setResourcePanelVisible: () => {},
              statusContainer,
            }}
          >
            <Link to="/settings">Settings</Link>
            <TerminalWorkspace projects={[]} />
          </SidebarVisibilityContext.Provider>
        </MemoryRouter>,
      ),
    );
    expect(statusContainer.querySelector('[role="status"]')).not.toBeNull();
    expect(host.querySelector('[role="status"]')).toBeNull();
    await act(async () => host.querySelector<HTMLAnchorElement>("a")!.click());
    expect(statusContainer.childElementCount).toBe(0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    statusContainer.remove();
  }
});

it("switches between peer file and terminal tabs without replacing running panes", async () => {
  const project = makeProject();
  const tabs = [
    createTerminalTab(project.id, undefined, project.path),
    createTerminalTab(project.id, undefined, project.path),
  ];
  writeTerminalLayout({ tabs, activeIds: {}, lastActiveId: tabs[0].id });
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === "terminal_list"
      ? []
      : command === "terminal_create"
        ? { id: crypto.randomUUID(), cwd: project.path }
        : undefined,
  );
  function Workspace() {
    const [shown, setShown] = useState(true);
    return (
      <TerminalWorkspace
        projects={[project]}
        shown={shown}

        onSelectTerminal={() => setShown(true)}
        extraTabs={
          <button
            role="tab"
            aria-selected={!shown}
            onClick={() => setShown(false)}
          >
            demo.ts
          </button>
        }
        content={!shown && <output>File preview</output>}
      />
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={[`/project/${project.id}`]}>
          <Workspace />
        </MemoryRouter>,
      ),
    );
    const tablist = host.querySelector('[role="tablist"]')!;
    const tabButtons =
      tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabButtons).toHaveLength(3);
    const panels = Array.from(host.querySelectorAll('[role="tabpanel"]'));
    await act(async () => tabButtons[2].click());
    expect(host.querySelector("section")?.hidden).toBe(false);
    expect(host.querySelector("output")?.textContent).toBe("File preview");
    expect(tabButtons[0].getAttribute("aria-selected")).toBe("false");
    expect(tabButtons[1].getAttribute("aria-selected")).toBe("false");
    await act(async () => tabButtons[1].click());
    expect(tabButtons[1].getAttribute("aria-selected")).toBe("true");
    expect(host.querySelector("output")).toBeNull();
    expect(Array.from(host.querySelectorAll('[role="tabpanel"]'))).toEqual(
      panels,
    );
    expect(panels[1].hasAttribute("hidden")).toBe(false);
    await act(async () => tabButtons[2].click());
    expect(host.querySelector('[aria-label="terminal.newMenu"]')).toBeNull();
    expect(
      host.querySelector('[aria-label="terminal.herdrSidebar"]'),
    ).toBeNull();
    await act(async () => tabButtons[1].click());
    await openNew(host);
    expect(host.querySelector("output")).toBeNull();
    expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === "terminal_close"),
    ).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

async function selectHerdrAction(host: HTMLElement, label: string) {
  const action = host.querySelector<HTMLButtonElement>(
    label === "terminal.herdrLaunch"
      ? 'button[aria-label="Herdr"]'
      : `button[aria-label="${label}"]`,
  )!;
  expect(action).not.toBeNull();
  await act(async () => action.click());
}

it("launches installed Herdr from the toolbar in the selected shell", async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "terminal_list") return [];
    if (command === "terminal_project_directory") return "<workspace>";
    if (command === "terminal_create")
      return { id: "launch-pty", cwd: "<workspace>" };
    if (command === "terminal_launch_state")
      return { ready: true, revision: 9, herdr_active: false };
    if (command === "herdr_detect")
      return { path: "<tools>/herdr", version: "1.0.0", managed: false };
    if (command === "herdr_check_update")
      return { has_update: false, latest_version: "1.0.0", managed: false };
    if (command === "terminal_launch_herdr") return true;
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter
          initialEntries={[
            { pathname: "/terminal", state: { projectId: "demo" } },
          ]}
        >
          <TerminalWorkspace
            projects={[{ ...makeProject(), path: "<workspace>" }]}
          />
        </MemoryRouter>,
      ),
    );
    await selectHerdrAction(host, "terminal.herdrLaunch");
    expect(invoke).toHaveBeenCalledWith("terminal_launch_herdr", {
      id: "launch-pty",
      revision: 9,
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it.each([
  ["Codex", "codex"],
  ["Claude Code", "claude"],
  ["Claude Agent Teams", "claude_teams"],
  ["OpenCode", "opencode"],
  ["Hermes Agent", "hermes"],
])(
  "opens %s only after selecting it from the new menu, in the current worktree",
  async (label, agent) => {
    const project = makeProject();
    const topic = "<workspace>/topic";
    vi.mocked(invoke).mockImplementation(async (command) =>
      command === "terminal_list"
        ? []
        : command === "terminal_create"
          ? { id: crypto.randomUUID(), cwd: topic }
          : undefined,
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <MemoryRouter
            initialEntries={[
              `/project/${project.id}?worktree=${encodeURIComponent(topic)}`,
            ]}
          >
            <TerminalWorkspace
              projects={[project]}
              tools={["codex", "claude_code", "opencode", "hermes"].map((key) =>
                makeTool(key),
              )}
            />
          </MemoryRouter>,
        ),
      );
      const creations = () =>
        vi
          .mocked(invoke)
          .mock.calls.filter(([command]) => command === "terminal_create");
      expect(creations()).toHaveLength(1);
      const plus = host.querySelector<HTMLButtonElement>(
        '[aria-label="terminal.newMenu"]',
      )!;
      await act(async () => plus.click());
      expect(creations()).toHaveLength(1);
      const option = [
        ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
      ].find((item) => item.textContent === label)!;
      await act(async () => option.click());
      expect(creations()).toHaveLength(2);
      expect(creations()[1][1]).toMatchObject({
        projectId: project.id,
        worktreePath: topic,
        agent,
      });
      expect(
        host.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
      ).toContain(label);
      expect(document.querySelector('[role="menu"]')).toBeNull();
      expect(
        vi
          .mocked(invoke)
          .mock.calls.filter(([command]) => command === "terminal_write"),
      ).toHaveLength(0);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  },
);
