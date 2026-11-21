// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { makeProject } from "../../../tests/fixtures/workspace";
import { makeTaskMetadata } from "../../../tests/fixtures/repositoryTask";
import type { RepositoryTask, TaskBinding } from "../../lib/tauri";
import { TaskBrowser } from "./TaskBrowser";
import { WorkspaceFilesContext } from "../../hooks/useWorkspaceFiles";
async function chooseProvider(host: HTMLElement, label: string) {
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[role="combobox"][aria-label="tasks.provider"]',
      )!
      .click(),
  );
  const option = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
  ].find((item) => item.textContent === label)!;
  await act(async () => option.click());
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => []) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
}));
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("shows an explicit connection action before any repository is bound", async () => {
  const element = document.createElement("div");
  const root = createRoot(element);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <TaskBrowser projects={[]} />
      </MemoryRouter>,
    ),
  );
  expect(element.textContent).toContain("tasks.notConnected");
  expect(
    element.querySelector('button[aria-label="tasks.connections"]'),
  ).not.toBeNull();
  await act(async () => root.unmount());
});

it("retains successful sources, loaded rows and copyable context through details", async () => {
  const binding: TaskBinding = {
    id: "gh",
    project_id: "demo",
    provider: "github",
    host: "github.example.invalid",
    repository: "team/demo",
    launcher: null,
  };
  const task: RepositoryTask = {
    key: "github://github.example.invalid/team/demo/issue/7",
    binding_id: "gh",
    project_id: "demo",
    provider: "github",
    host: "github.example.invalid",
    repository: "team/demo",
    kind: "issue",
    number: 7,
    title: "Example task",
    state: "open",
    metadata: makeTaskMetadata({
      author: "contributor",
      labels: ["bug", "priority::high", "parser", "needs review"],
    }),
    updated_at: new Date(2026, 0, 1, 13, 42, 57).toISOString(),
    assignees: ["demo"],
    url: "https://github.example.invalid/team/demo/issues/7",
  };
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "task_bindings")
      return [
        binding,
        {
          ...binding,
          id: "gl",
          provider: "gitlab",
          host: "gitlab.example.invalid",
        },
      ];
    if (command === "task_list") {
      if (args && "bindingId" in args && args.bindingId === "gl")
        throw { kind: "permission", message: "HTTP 403" };
      const more = args && "page" in args && args.page === 2;
      return {
        identity: "demo",
        items: [
          more
            ? { ...task, key: "second", number: 8, title: "Second task" }
            : task,
        ],
        has_more: !more,
        limited: false,
      };
    }
    if (command === "task_detail")
      return {
        summary: task,
        body: "Review the example requirement.",
        comments: [],
        has_more_comments: false,
      };
    return undefined;
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <TaskBrowser projects={[]} />
      </MemoryRouter>,
    ),
  );
  expect(host.textContent).toContain("Example task");
  const updated = host.querySelector("tbody tr td:nth-child(5)")?.textContent;
  expect(updated).toContain(new Date(task.updated_at).toLocaleDateString());
  expect(updated).toContain("13:42");
  expect(updated).not.toContain("13:42:57");
  const row = host.querySelector("tbody tr");
  expect(row?.textContent).toContain("contributor");
  expect(row?.textContent).toContain("needs review");
  expect(row?.querySelector("td:nth-child(4)")?.textContent).toContain(
    "tasks.open",
  );
  await act(async () =>
    row
      ?.querySelector<HTMLButtonElement>(
        'button[aria-label="tasks.openRepository"]',
      )
      ?.click(),
  );
  expect(openUrl).toHaveBeenCalledWith(
    "https://github.example.invalid/team/demo",
  );
  expect(host.textContent).toContain("HTTP 403");
  const more = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === "tasks.loadMore",
  );
  await act(async () => more?.click());
  expect(host.textContent).toContain("Second task");
  const table = host.querySelector("table");
  const scroll = table?.parentElement;
  if (scroll) scroll.scrollTop = 80;
  const open = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Example task"),
  );
  await act(async () => open?.click());
  expect(
    host.querySelector('aside[aria-label="tasks.details"]')?.textContent,
  ).toContain("Review the example requirement.");
  const copy = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.getAttribute("aria-label") === "tasks.copy",
  );
  await act(async () => copy?.click());
  expect(vi.mocked(writeText).mock.calls[0]?.[0]).toContain(
    "github.example.invalid/team/demo",
  );
  expect(vi.mocked(writeText).mock.calls[0]?.[0]).toContain(
    "Review the example requirement.",
  );
  const back = host.querySelector<HTMLButtonElement>(
    'button[aria-label="common.back"]',
  );
  await act(async () => back?.click());
  expect(host.querySelector("table")).toBe(table);
  expect(scroll?.scrollTop).toBe(80);
  expect(host.textContent).toContain("Second task");
  expect(
    vi
      .mocked(invoke)
      .mock.calls.some(([command]) => command === "terminal_write"),
  ).toBe(false);
  await act(async () => root.unmount());
  host.remove();
});

it("refreshes repositories without discarding the cached login identity", async () => {
  let resolveSources: (bindings: TaskBinding[]) => void = () => {};
  const pending = new Promise<TaskBinding[]>((resolve) => {
    resolveSources = resolve;
  });
  let reads = 0;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "task_bindings") {
      reads += 1;
      return reads === 1 ? pending : [];
    }
    return undefined;
  });
  const element = document.createElement("div");
  const root = createRoot(element);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <TaskBrowser projects={[]} />
      </MemoryRouter>,
    ),
  );
  expect(element.textContent).not.toContain("tasks.notConnected");
  expect(element.textContent).toContain("common.loading");
  await act(async () => resolveSources([]));
  expect(element.textContent).toContain("tasks.notConnected");
  await act(async () =>
    element
      .querySelector<HTMLButtonElement>('button[aria-label="settings.refresh"]')
      ?.click(),
  );
  expect(reads).toBe(2);
  const discoveries = vi
    .mocked(invoke)
    .mock.calls.filter(([command]) => command === "task_bindings");
  expect(discoveries.map(([, args]) => args)).toEqual([
    { refresh: false },
    { refresh: false },
  ]);
  await act(async () => root.unmount());
});

it("uses CLI host discovery to select GitLab when choosing a self-hosted remote", async () => {
  const remote = "git.example.invalid/group/demo";
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "task_bindings") return [];
    if (command === "task_project_remotes")
      return [{ remote, provider: "gitlab" }];
    return undefined;
  });
  const element = document.createElement("div");
  const root = createRoot(element);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <TaskBrowser
          projects={[
            {
              id: "demo",
              name: "Demo",
              path: "~/projects/demo",
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
            },
          ]}
        />
      </MemoryRouter>,
    ),
  );
  await act(async () =>
    element
      .querySelector<HTMLButtonElement>(
        'button[aria-label="tasks.connections"]',
      )
      ?.click(),
  );
  const button = [
    ...element.querySelectorAll<HTMLButtonElement>("button"),
  ].find((item) => item.textContent === remote);
  expect(button).toBeDefined();
  await act(async () => button?.click());
  await act(async () =>
    element
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("task_save_binding", {
    binding: expect.objectContaining({
      provider: "gitlab",
      host: "git.example.invalid",
      repository: "group/demo",
      launcher: null,
    }),
  });
  await act(async () => root.unmount());
});

const scopedBindings: TaskBinding[] = ["github", "gitlab"].map(
  (provider, index) => ({
    id: `binding-${index}`,
    project_id: `project-${index}`,
    provider: provider === "github" ? "github" : "gitlab",
    host: `${provider}.example.invalid`,
    repository: `team/project-${index}`,
    launcher: null,
  }),
);

it("offers repository setup when the selected platform has no discovered source", async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "task_bindings") return [scopedBindings[0]];
    if (command === "task_list")
      return { items: [], identity: "demo", has_more: false, limited: false };
    return undefined;
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <TaskBrowser projects={[]} />
      </MemoryRouter>,
    ),
  );
  await chooseProvider(host, "GitLab");
  expect(host.textContent).toContain("tasks.notConnected");
  expect(host.textContent).not.toContain("tasks.empty");
  const setup = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === "tasks.connections",
  )!;
  await act(async () => setup.click());
  expect(
    host.querySelector('section[aria-label="tasks.connections"] form'),
  ).not.toBeNull();
  await act(async () => root.unmount());
});

it("switches platform and kind filters, retains the project scope, and opens the selected repository", async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "task_bindings") return scopedBindings;
    if (command === "task_list")
      return { items: [], identity: "demo", has_more: false, limited: false };
    return undefined;
  });
  vi.mocked(openUrl).mockResolvedValue();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <TaskBrowser
          projects={scopedBindings.map((binding, index) => ({
            ...makeProject(),
            id: binding.project_id,
            name: `Project ${index}`,
          }))}
        />
      </MemoryRouter>,
    ),
  );
  const radio = (name: string) =>
    host.querySelector<HTMLButtonElement>(
      `[role="radio"][aria-label="${name}"]`,
    )!;
  const projectMenu = () =>
    host.querySelector<HTMLButtonElement>(
      '[role="combobox"][aria-label="tasks.project"]',
    )!;
  const choose = async (label: string, value: string) => {
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          `[role="combobox"][aria-label="${label}"]`,
        )!
        .click(),
    );
    const option = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ].find((option) => option.textContent === value)!;
    await act(async () => option.click());
  };
  await choose("tasks.project", "Project 0");
  expect(projectMenu().textContent).toBe("Project 0");
  await chooseProvider(host, "GitLab");
  expect(projectMenu().textContent).toBe("Project 0");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    "tasks.providerMismatch",
  );
  expect(host.textContent).not.toContain("tasks.notConnected");
  await act(async () => projectMenu().click());
  expect(
    [...document.querySelectorAll('[role="option"]')].map(
      (option) => option.textContent,
    ),
  ).toEqual(["tasks.allProjects", "Project 0", "Project 1"]);
  await act(async () =>
    document.querySelectorAll<HTMLButtonElement>('[role="option"]')[2].click(),
  );
  await act(async () =>
    document.querySelectorAll<HTMLButtonElement>('[role="option"]')[1].click(),
  );
  await act(async () => radio("MR").click());
  const pickFilter = async (section: string, value: string) => {
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="tasks.filters"]')!
        .click(),
    );
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find((button) => button.textContent === section)!
        .click(),
    );
    await act(async () =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[role="dialog"] button',
        ),
      ]
        .find((button) => button.textContent === value)!
        .click(),
    );
  };
  await pickFilter("tasks.state", "tasks.closed");
  await pickFilter("tasks.assignee", "@me");
  expect(
    host.querySelector<HTMLInputElement>('input[aria-label="tasks.search"]')
      ?.value,
  ).toBe("is:pr is:closed assignee:@me");
  expect(vi.mocked(invoke)).toHaveBeenLastCalledWith(
    "task_list",
    expect.objectContaining({
      bindingId: "binding-1",
      filters: {
        kind: "review",
        state: "closed",
        personal: "all",
        assignee: "@me",
        text: "",
      },
    }),
  );
  expect(JSON.parse(localStorage.getItem("agent-hub.taskView")!)).toMatchObject(
    {
      provider: "gitlab",
      projectIds: ["project-1"],
      filters: {
        kind: "review",
        assignee: "@me",
        text: "is:pr is:closed assignee:@me",
      },
    },
  );
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="tasks.openRemote"]',
      )!
      .click(),
  );
  expect(openUrl).toHaveBeenCalledWith(
    "https://gitlab.example.invalid/team/project-1",
  );
  await act(async () => root.unmount());
  host.remove();
});

it("supports keyboard platform switching and ignores a previous platform's late result", async () => {
  let resolveOld!: (value: unknown) => void;
  const old = new Promise((resolve) => {
    resolveOld = resolve;
  });
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "task_bindings") return scopedBindings;
    if (
      command === "task_list" &&
      args &&
      "bindingId" in args &&
      args.bindingId === "binding-0"
    )
      return old;
    if (command === "task_list")
      return { items: [], identity: "demo", has_more: false, limited: false };
    return undefined;
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <TaskBrowser projects={[]} />
      </MemoryRouter>,
    ),
  );
  const platform = host.querySelector<HTMLButtonElement>(
    '[role="combobox"][aria-label="tasks.provider"]',
  )!;
  const key = async (value: string) =>
    act(async () =>
      platform.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: value,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
  platform.focus();
  await key("ArrowDown");
  await key("End");
  await key("Enter");
  expect(document.activeElement).toBe(platform);
  expect(platform.textContent).toBe("GitLab");
  await act(async () =>
    resolveOld({
      items: [
        {
          key: "old",
          binding_id: "binding-0",
          project_id: "project-0",
          provider: "github",
          host: "github.example.invalid",
          repository: "team/project-0",
          kind: "issue",
          number: 1,
          title: "Stale task",
          state: "open",
          updated_at: "",
          assignees: [],
          url: "https://github.example.invalid/team/project-0/issues/1",
        },
      ],
      identity: "old",
      has_more: false,
      limited: false,
    }),
  );
  expect(host.textContent).not.toContain("Stale task");
  expect(host.textContent).toContain("tasks.empty");
  await key("ArrowUp");
  await key("ArrowUp");
  await key("Enter");
  expect(document.activeElement).toBe(platform);
  expect(platform.textContent).toBe("GitHub");
  expect(host.querySelector('[role="radio"][aria-label="PR"]')).not.toBeNull();
  await act(async () => root.unmount());
  host.remove();
});

it("follows the selected workspace on entry and changes while retaining task filters", async () => {
  localStorage.setItem(
    "agent-hub.taskView",
    JSON.stringify({
      provider: "all",
      projectIds: [],
      filters: { kind: "review", state: "closed", personal: "all", text: "" },
    }),
  );
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "task_bindings") return scopedBindings;
    if (command === "task_list")
      return { items: [], identity: "demo", has_more: false, limited: false };
    return undefined;
  });
  const projects = scopedBindings.map((binding, index) => ({
    ...makeProject(),
    id: binding.project_id,
    name: `Project ${index}`,
  }));
  const host = document.createElement("div");
  const root = createRoot(host);
  const render = (index: number) => (
    <MemoryRouter>
      <WorkspaceFilesContext.Provider
        value={{
          files: {},
          setFiles: vi.fn(),
          checkout: {
            projectId: projects[index].id,
            worktreePath: projects[index].path,
          },
          setCheckout: vi.fn(),
        }}
      >
        <TaskBrowser projects={projects} />
      </WorkspaceFilesContext.Provider>
    </MemoryRouter>
  );
  const requests = () =>
    vi.mocked(invoke).mock.calls.filter(([command]) => command === "task_list");
  try {
    await act(async () => root.render(render(1)));
    expect(
      host.querySelector('[role="combobox"][aria-label="tasks.project"]')
        ?.textContent,
    ).toBe("Project 1");
    expect(requests().at(-1)?.[1]).toMatchObject({
      bindingId: "binding-1",
      filters: { kind: "review", state: "closed" },
    });
    await act(async () => root.render(render(0)));
    expect(
      host.querySelector('[role="combobox"][aria-label="tasks.project"]')
        ?.textContent,
    ).toBe("Project 0");
    expect(requests().at(-1)?.[1]).toMatchObject({
      bindingId: "binding-0",
      filters: { kind: "review", state: "closed" },
    });
  } finally {
    await act(async () => root.unmount());
  }
});

it("keeps the known identity visible while refreshing task rows", async () => {
  const binding: TaskBinding = {
    id: "cached-login",
    project_id: "demo",
    provider: "github",
    host: "github.example.invalid",
    repository: "team/demo",
    launcher: null,
  };
  let reads = 0;
  let finish: (value: unknown) => void = () => {};
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "task_bindings") return [binding];
    if (command === "task_list") {
      reads += 1;
      if (reads > 1)
        return new Promise((resolve) => {
          finish = resolve;
        });
      return {
        identity: "cached-account",
        items: [],
        has_more: false,
        limited: false,
      };
    }
  });
  const element = document.createElement("div");
  const root = createRoot(element);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TaskBrowser projects={[]} />
        </MemoryRouter>,
      ),
    );
    expect(element.textContent).toContain("cached-account");
    await act(async () =>
      element
        .querySelector<HTMLButtonElement>('[aria-label="settings.refresh"]')!
        .click(),
    );
    expect(element.textContent).toContain("cached-account");
    expect(element.textContent).not.toContain("tasks.checkingIdentity");
    await act(async () =>
      finish({
        identity: "cached-account",
        items: [],
        has_more: false,
        limited: false,
      }),
    );
  } finally {
    await act(async () => root.unmount());
  }
});

it("updates the account picker and unlocks switching while repository refresh is still pending", async () => {
  await import("../accounts/PlatformAccountsDialog");
  const originalShow = HTMLDialogElement.prototype.showModal;
  const originalClose = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  let active = "first";
  let finishRefresh!: (value: unknown) => void;
  const inventory = () =>
    ["first", "second"].map((username) => ({
      host: "github.com",
      username,
      active: username === active,
      authenticated: true,
      switchable: true,
    }));
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "task_bindings")
      return args && "refresh" in args && args.refresh
        ? new Promise((resolve) => {
            finishRefresh = resolve;
          })
        : [];
    if (command === "platform_account_contexts")
      return [
        {
          id: "default-github",
          provider: "github",
          host: "github.com",
          label: "",
          project_scoped: false,
          remembered: false,
        },
      ];
    if (command === "platform_account_list") return inventory();
    if (command === "platform_account_switch") {
      active = "second";
      return inventory();
    }
    return [];
  });
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TaskBrowser projects={[]} />
        </MemoryRouter>,
      ),
    );
    await act(async () =>
      element
        .querySelector<HTMLButtonElement>('[aria-label="tasks.accounts"]')!
        .click(),
    );
    const switchButton = [
      ...element.querySelectorAll<HTMLButtonElement>("dialog button"),
    ].find((button) => button.textContent === "accounts.switch")!;
    await act(async () => switchButton.click());
    expect(
      element.querySelector('dialog [role="combobox"]')?.textContent,
    ).toContain("@second");
    expect(
      element.querySelector<HTMLButtonElement>(
        'dialog button[aria-label="common.close"]',
      )?.disabled,
    ).toBe(false);
    expect(
      element.querySelector('button[aria-label="tasks.accounts"]')?.textContent,
    ).toContain("@second");
    expect(finishRefresh).toBeTypeOf("function");
    await act(async () => finishRefresh([]));
  } finally {
    await act(async () => root.unmount());
    element.remove();
    HTMLDialogElement.prototype.showModal = originalShow;
    HTMLDialogElement.prototype.close = originalClose;
  }
});

it("filters real runner inventories by platform and retains task search when returning", async () => {
  let paused = false;
  let holdRefresh = false;
  let finishRefresh: (
    result: "success" | "network" | "permission",
  ) => void = () => {};
  let githubRunnerName = "github machine";
  let runnerDescription = "initializing machine";
  const bindings = [
    ...scopedBindings,
    { ...scopedBindings[1], id: "restricted", repository: "team/restricted" },
  ];
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "task_project_remotes") return [];
    if (command === "task_bindings")
      return bindings.map((binding) => ({ ...binding }));
    if (command === "task_list")
      return { items: [], identity: "demo", has_more: false, limited: false };
    if (command === "task_edit_runner") {
      runnerDescription = "Renamed runner";
      return undefined;
    }
    if (command === "task_manage_runner") {
      if (args && "action" in args && args.action === "pause") paused = true;
      return undefined;
    }
    if (command === "task_runners") {
      const binding = bindings.find(
        ({ id }) => args && "bindingId" in args && id === args.bindingId,
      )!;
      if (binding.id === "restricted")
        throw { kind: "permission", message: "HTTP 403" };
      const runner = {
        id: 128,
        name:
          binding.provider === "github" ? githubRunnerName : "gitlab machine",
        state: binding.provider === "github" ? "online" : "stale",
        paused: false,
        busy: true,
        os: "Linux",
        scope: binding.provider === "gitlab" ? "project" : null,
        labels: null,
        contacted_at: null,
      };
      const extraRunner = {
        ...runner,
        id: 129,
        short_id: "demo1234",
        name: runnerDescription,
        description: runnerDescription,
        can_update: true,
        paused,
        state: "initializing",
        created_by: "Demo Creator",
        created_at: "2026-11-01T08:00:00Z",
        labels: ["linux-ci"],
        version: "18.0.0",
      };
      if (args && "runnerId" in args)
        return {
          ...(args.runnerId === 129 ? extraRunner : runner),
          job_count: 11,
          paused: args.runnerId === 129 && paused,
          can_update: args.runnerId === 129,
          can_delete: false,
        };
      const inventory = {
        items: binding.provider === "github" ? [runner] : [runner, extraRunner],
        identity: "demo",
        limited: false,
        assignable:
          binding.provider === "gitlab"
            ? [{ ...extraRunner, id: 130, name: "Assignable machine" }]
            : null,
        can_create_runner: binding.provider === "gitlab",
      };
      if (binding.provider === "github" && holdRefresh) {
        return new Promise((resolve, reject) => {
          finishRefresh = (result) => {
            if (result === "success") {
              githubRunnerName = "Refreshed runner";
              resolve({
                ...inventory,
                items: [{ ...runner, name: githubRunnerName }],
              });
            } else {
              reject({
                kind: result,
                message:
                  result === "network" ? "Connection interrupted" : "HTTP 403",
              });
            }
          };
        });
      }
      return inventory;
    }
    return undefined;
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <TaskBrowser
          projects={scopedBindings.map((binding) => ({
            ...makeProject(),
            id: binding.project_id,
            name: binding.project_id,
          }))}
        />
      </MemoryRouter>,
    ),
  );
  const input = () =>
    host.querySelector<HTMLInputElement>('[aria-label="tasks.search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input(), "assignee:@me");
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
  const chooseView = (name: string) =>
    act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          `[role="radio"][aria-label="${name}"]`,
        )!
        .click(),
    );
  await chooseView("runners.title");
  const categoryControl = () =>
    host.querySelector<HTMLButtonElement>(
      '[role="combobox"][aria-label="runners.categories.label"]',
    )!;
  expect(categoryControl().textContent).toContain(
    "runners.categories.assigned (2)",
  );
  expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
  await chooseView("tasks.platformConnections");
  expect(
    host
      .querySelector('[role="radio"][aria-label="tasks.platformConnections"]')
      ?.getAttribute("aria-checked"),
  ).toBe("true");
  expect(host.querySelector("h1")?.textContent).toBe(
    "tasks.platformConnections",
  );
  expect(
    host.querySelector('section[aria-label="tasks.connections"] form'),
  ).not.toBeNull();
  expect(host.querySelector("tbody")).toBeNull();
  expect(
    host.querySelector(
      '[role="combobox"][aria-label="runners.categories.label"]',
    ),
  ).toBeNull();
  await chooseView("runners.title");
  expect(
    host.querySelector('section[aria-label="tasks.connections"]'),
  ).toBeNull();
  expect(host.querySelectorAll("tbody tr")).toHaveLength(2);

  expect(
    [...host.querySelectorAll("button")].some(
      (button) => button.textContent === "runners.create.title",
    ),
  ).toBe(true);
  const chooseCategory = async (label: string) => {
    await act(async () => categoryControl().click());
    const option = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ].find((button) => button.textContent?.trim() === label)!;
    await act(async () => option.click());
  };
  await chooseCategory("runners.categories.assignable (1)");
  expect(host.querySelector("tbody")?.textContent).toContain(
    "Assignable machine",
  );
  await chooseCategory("runners.categories.all (3)");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(3);
  expect(
    [...host.querySelectorAll("thead th")].map((cell) => cell.textContent),
  ).toEqual(
    expect.arrayContaining([
      "runners.status",
      "runners.configuration",
      "runners.owner",
    ]),
  );
  expect(host.querySelector("thead")?.textContent).not.toContain(
    "runners.contacted",
  );
  expect(host.textContent).toContain("github machine");
  expect(host.textContent).toContain("gitlab machine");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "HTTP 403",
  );
  const runnerButtons = [
    ...host.querySelectorAll<HTMLButtonElement>("tbody button[aria-expanded]"),
  ];
  await act(async () => runnerButtons[0].click());
  const details = host.querySelector("aside[aria-labelledby]");
  expect(
    details?.previousElementSibling?.querySelector("table"),
  ).not.toBeNull();
  expect(details?.textContent).toContain("github.example.invalid");
  expect(host.querySelector("dialog")).toBeNull();
  expect(runnerButtons[1].disabled).toBe(false);
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(host.querySelector("aside[aria-labelledby]")).toBeNull();
  expect(document.activeElement).toBe(runnerButtons[0]);
  expect(runnerButtons[1].closest("tr")?.textContent).toContain(
    "runners.stale",
  );
  const actionButton = (label: string, root: ParentNode | null = host) =>
    [...(root?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      (button) => button.textContent === label,
    );
  await act(async () => runnerButtons[1].click());
  expect(actionButton("runners.actions.pause")).toBeUndefined();
  expect(actionButton("runners.actions.delete")).toBeUndefined();
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        'aside button[aria-label="common.close"]',
      )!
      .click(),
  );
  const chooseTag = async (label: string) => {
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[role="combobox"][aria-label="runners.labels"]',
        )!
        .click(),
    );
    const option = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ].find((button) => button.textContent === label)!;
    await act(async () => option.click());
  };
  await chooseTag("linux-ci");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(host.querySelector("tbody")?.textContent).toContain(
    "initializing machine",
  );
  await chooseTag("runners.allTags");
  const tagBadge = [
    ...host.querySelectorAll<HTMLButtonElement>("tbody button"),
  ].find((button) => button.textContent === "linux-ci")!;
  await act(async () => tagBadge.click());
  expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(tagBadge.getAttribute("aria-pressed")).toBe("true");
  await act(async () => tagBadge.click());
  const chooseStatus = async (label: string) => {
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[role="combobox"][aria-label="runners.status"]',
        )!
        .click(),
    );
    const option = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ].find((button) => button.textContent?.trim() === label)!;
    await act(async () => option.click());
  };
  await chooseStatus("initializing (1)");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(host.querySelector("tbody")?.textContent).toContain("#129 (demo1234)");
  expect(host.querySelector("tbody")?.textContent).toContain("18.0.0");
  await act(async () =>
    host.querySelector<HTMLButtonElement>("tbody button")!.click(),
  );
  expect(
    [...host.querySelectorAll("aside dd")].map((field) => field.textContent),
  ).toEqual(
    expect.arrayContaining([
      "initializing",
      "11",
      "Demo Creator",
      "18.0.0",
      "linux-ci",
    ]),
  );
  expect(actionButton("runners.actions.delete")).toBeUndefined();
  await act(async () => actionButton("runners.actions.pause")!.click());
  expect(vi.mocked(invoke)).not.toHaveBeenCalledWith(
    "task_manage_runner",
    expect.anything(),
  );
  await act(async () =>
    actionButton(
      "runners.actions.pause",
      document.querySelector('[role="alertdialog"]'),
    )!.click(),
  );
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("task_manage_runner", {
    bindingId: scopedBindings[1].id,
    runnerId: 129,
    action: "pause",
  });
  expect(actionButton("runners.actions.resume")).toBeDefined();
  const rowEditButton = host.querySelector<HTMLButtonElement>(
    'tbody button[aria-label="runners.actions.edit"]',
  )!;
  expect(rowEditButton).toBeDefined();
  expect(
    host.querySelector('tbody button[aria-label="runners.actions.delete"]'),
  ).toBeNull();
  const show = HTMLDialogElement.prototype.showModal;
  const closeModal = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  try {
    await act(async () => rowEditButton.click());
    const form = host.querySelector<HTMLFormElement>("dialog form")!;
    const description = form.querySelector("input")!;
    expect(description.value).toBe("initializing machine");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(description, "Renamed runner");
      description.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("task_edit_runner", {
      bindingId: scopedBindings[1].id,
      runnerId: 129,
      edit: { description: "Renamed runner" },
    });
    expect(host.querySelector("tbody")?.textContent).toContain(
      "Renamed runner",
    );
  } finally {
    HTMLDialogElement.prototype.showModal = show;
    HTMLDialogElement.prototype.close = closeModal;
  }
  await chooseStatus("runners.all (3)");
  await chooseProvider(host, "GitHub");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(host.textContent).toContain("github machine");
  expect(host.textContent).not.toContain("gitlab machine");
  holdRefresh = true;
  const refresh = () =>
    act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="settings.refresh"]',
        )!
        .click(),
    );
  await refresh();
  expect(host.querySelector("tbody")?.textContent).toContain("github machine");
  expect(host.textContent).not.toContain("common.loading");
  expect(host.querySelector('[aria-busy="true"] table')).not.toBeNull();
  await act(async () => finishRefresh("success"));
  expect(host.querySelector("tbody")?.textContent).toContain(
    "Refreshed runner",
  );
  await refresh();
  expect(host.querySelector("tbody")?.textContent).toContain(
    "Refreshed runner",
  );
  await act(async () => finishRefresh("network"));
  expect(host.querySelector("tbody")?.textContent).toContain(
    "Refreshed runner",
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Connection interrupted",
  );
  await refresh();
  await act(async () => finishRefresh("permission"));
  expect(host.querySelector("tbody")?.textContent).not.toContain(
    "Refreshed runner",
  );
  await chooseView("tasks.issues");
  expect(input().value).toBe("assignee:@me");
  await act(async () => root.unmount());
  host.remove();
});

it("shows schedules within the selected platform and filters by active state", async () => {
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "task_bindings") return scopedBindings;
    if (command === "task_list")
      return { items: [], identity: "demo", has_more: false, limited: false };
    if (command === "task_schedules") {
      const repo = scopedBindings.find(
        (binding) =>
          args && "bindingId" in args && binding.id === args.bindingId,
      )!;
      const gitlab = repo.provider === "gitlab";
      return {
        limited: false,
        items: [
          {
            id: "10",
            title: gitlab ? "Daily GitLab checks" : "Scheduled GitHub workflow",
            rules: [
              { cron: "0 1 * * *", timezone: gitlab ? "Asia/Shanghai" : "UTC" },
            ],
            target: gitlab ? "dev" : "main",
            active: gitlab,
            last_status: gitlab ? "success" : null,
            last_run_url: null,
            owner: gitlab ? "Demo Owner" : null,
            next_run_at: null,
            url: `https://${repo.host}/${repo.repository}/${gitlab ? "-/pipeline_schedules" : "actions"}`,
          },
        ],
      };
    }
    return undefined;
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <TaskBrowser
          projects={scopedBindings.map(({ project_id }) => ({
            ...makeProject(),
            id: project_id,
          }))}
        />
      </MemoryRouter>,
    ),
  );
  const radio = (label: string) =>
    host.querySelector<HTMLButtonElement>(
      `[role="radio"][aria-label="${label}"]`,
    )!;
  await act(async () => radio("schedules.title").click());
  expect(host.querySelector("tbody")?.textContent).toContain(
    "Daily GitLab checks",
  );
  expect(host.querySelector("tbody")?.textContent).toContain(
    "Scheduled GitHub workflow",
  );
  await act(async () => radio("schedules.active (1)").click());
  expect(host.querySelector("tbody")?.textContent).toContain("Demo Owner");
  expect(host.querySelector("tbody")?.textContent).not.toContain(
    "Scheduled GitHub workflow",
  );
  await act(async () => radio("schedules.all (2)").click());
  await chooseProvider(host, "GitHub");
  expect(host.querySelector("tbody")?.textContent).toContain(
    "Scheduled GitHub workflow",
  );
  expect(host.querySelector("tbody")?.textContent).not.toContain(
    "Daily GitLab checks",
  );
  await act(async () => root.unmount());
  host.remove();
});
