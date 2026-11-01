// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { makeProject } from "../../../tests/fixtures/workspace";
import type { RepositoryTask, TaskBinding } from "../../lib/tauri";
import { TaskBrowser } from "./TaskBrowser";
import { WorkspaceFilesContext } from "../../hooks/useWorkspaceFiles";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => []) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
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
    updated_at: "2026-01-01T00:00:00Z",
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
    (button) => button.textContent === "tasks.copy",
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

it("waits for CLI source discovery and refreshes discovered repositories", async () => {
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
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[role="radio"][aria-label="GitLab"]')!
      .click(),
  );
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
  await act(async () => radio("GitLab").click());
  expect(projectMenu().textContent).toBe("Project 0");
  expect(host.textContent).toContain("tasks.notConnected");
  await act(async () => projectMenu().click());
  expect(
    [...document.querySelectorAll('[role="option"]')].map(
      (option) => option.textContent,
    ),
  ).toEqual(["tasks.allProjects", "Project 0", "Project 1"]);
  await act(async () =>
    document.querySelectorAll<HTMLButtonElement>('[role="option"]')[2].click(),
  );
  await act(async () => radio("MR").click());
  await act(async () => radio("tasks.closed").click());
  await choose("tasks.personal", "tasks.assigned");
  expect(vi.mocked(invoke)).toHaveBeenLastCalledWith(
    "task_list",
    expect.objectContaining({
      bindingId: "binding-1",
      filters: {
        kind: "review",
        state: "closed",
        personal: "assigned",
        text: "",
      },
    }),
  );
  expect(JSON.parse(localStorage.getItem("agent-hub.taskView")!)).toMatchObject(
    {
      provider: "gitlab",
      projectId: "project-1",
      filters: { kind: "review", personal: "assigned" },
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
  const all = host.querySelector<HTMLButtonElement>(
    '[role="radio"][aria-label="tasks.allProviders"]',
  )!;
  await act(async () => {
    all.focus();
    all.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
  });
  const gitlab = host.querySelector<HTMLButtonElement>(
    '[role="radio"][aria-label="GitLab"]',
  )!;
  expect(document.activeElement).toBe(gitlab);
  expect(gitlab.getAttribute("aria-checked")).toBe("true");
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
  await act(async () =>
    gitlab.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    ),
  );
  expect(document.activeElement?.getAttribute("aria-label")).toBe("GitHub");
  expect(host.querySelector('[role="radio"][aria-label="PR"]')).not.toBeNull();
  await act(async () => root.unmount());
  host.remove();
});

it("follows the selected workspace on entry and changes while retaining task filters", async () => {
  localStorage.setItem(
    "agent-hub.taskView",
    JSON.stringify({
      provider: "all",
      projectId: "all",
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
