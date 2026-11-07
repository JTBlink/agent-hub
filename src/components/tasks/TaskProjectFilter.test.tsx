// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { makeProject } from "../../../tests/fixtures/workspace";
import type { TaskBinding } from "../../lib/tauri";
import { TaskBrowser } from "./TaskBrowser";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      values?: { projects: string; current: string; selected: string },
    ) =>
      values
        ? `${key}: ${values.projects}: ${values.current} / ${values.selected}`
        : key,
  }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const projects = Array.from({ length: 5 }, (_, index) => ({
  ...makeProject(),
  id: `project-${index}`,
  name: `Project ${index}`,
}));
const bindings: TaskBinding[] = [0, 2, 3].map((index) => ({
  id: `binding-${index}`,
  project_id: projects[index].id,
  provider: "github",
  host: "github.example.invalid",
  repository: `team/project-${index}`,
  launcher: null,
}));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "task_bindings") return bindings;
    if (command === "task_list")
      return { items: [], identity: "demo", has_more: false, limited: false };
    if (command === "task_project_remotes") return [];
    return undefined;
  });
});
afterEach(() => {
  vi.clearAllMocks();
});

it("lists every registered project and retains an unconnected selection after reload", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  let root = createRoot(host);
  const render = async () => {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TaskBrowser projects={projects} />
        </MemoryRouter>,
      ),
    );
  };
  const projectMenu = () =>
    host.querySelector<HTMLButtonElement>(
      '[role="combobox"][aria-label="tasks.project"]',
    )!;
  await render();
  await act(async () => projectMenu().click());
  const options = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
  ];
  expect(options.map((option) => option.textContent)).toEqual([
    "tasks.allProjects",
    ...projects.map((project) => project.name),
  ]);
  vi.mocked(invoke).mockClear();
  await act(async () => options[2].click());
  expect(projectMenu().textContent).toBe("Project 1");
  expect(host.textContent).toContain("tasks.notConnected");
  expect(host.textContent).not.toContain("tasks.empty");
  expect(
    vi.mocked(invoke).mock.calls.some(([command]) => command === "task_list"),
  ).toBe(false);
  expect(JSON.parse(localStorage.getItem("agent-hub.taskView")!)).toMatchObject(
    {
      projectIds: ["project-1"],
    },
  );
  await act(async () => root.unmount());
  root = createRoot(host);
  await render();
  expect(projectMenu().textContent).toBe("Project 1");
  expect(host.textContent).toContain("tasks.notConnected");
  await act(async () => root.unmount());
  host.remove();
});

it("falls back to all projects when a selected project is removed", async () => {
  localStorage.setItem(
    "agent-hub.taskView",
    JSON.stringify({ projectId: "project-4", filters: {} }),
  );
  const host = document.createElement("div");
  const root = createRoot(host);
  const render = async (available = projects) => {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TaskBrowser projects={available} />
        </MemoryRouter>,
      ),
    );
  };
  await render();
  expect(
    host.querySelector('[role="combobox"][aria-label="tasks.project"]')
      ?.textContent,
  ).toBe("Project 4");
  await render(projects.slice(0, 4));
  expect(
    host.querySelector('[role="combobox"][aria-label="tasks.project"]')
      ?.textContent,
  ).toBe("tasks.allProjects");
  expect(JSON.parse(localStorage.getItem("agent-hub.taskView")!)).toMatchObject(
    {
      projectIds: [],
    },
  );
  await act(async () => root.unmount());
});

it.each([
  ["github", "GitHub", "GitLab"],
  ["gitlab", "GitLab", "GitHub"],
] as const)(
  "reports a platform mismatch for a %s project and recovers when switching back",
  async (provider, current, selected) => {
    const binding = { ...bindings[0], provider };
    localStorage.setItem(
      "agent-hub.taskView",
      JSON.stringify({ provider, projectId: binding.project_id, filters: {} }),
    );
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "task_bindings") return [binding];
      if (command === "task_list")
        return { items: [], identity: "demo", has_more: false, limited: false };
    });
    const host = document.createElement("div");
    const root = createRoot(host);
    const radio = (label: string) =>
      host.querySelector<HTMLButtonElement>(
        `[role="radio"][aria-label="${label}"]`,
      )!;
    try {
      await act(async () =>
        root.render(
          <MemoryRouter>
            <TaskBrowser projects={projects} />
          </MemoryRouter>,
        ),
      );
      vi.mocked(invoke).mockClear();
      await act(async () => radio(selected).click());
      expect(host.querySelector('[role="alert"]')?.textContent).toBe(
        `tasks.providerMismatch: Project 0: ${current} / ${selected}`,
      );
      expect(host.textContent).not.toContain("tasks.notConnected");
      expect(host.textContent).not.toContain("tasks.empty");
      expect(
        [...host.querySelectorAll("button")].some(
          (button) => button.textContent === "tasks.connections",
        ),
      ).toBe(false);
      expect(
        vi
          .mocked(invoke)
          .mock.calls.some(([command]) => command === "task_list"),
      ).toBe(false);
      expect(
        host.querySelector('[role="combobox"][aria-label="tasks.project"]')
          ?.textContent,
      ).toBe("Project 0");
      await act(async () => radio(current).click());
      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(host.textContent).toContain("tasks.empty");
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        "task_list",
        expect.objectContaining({ bindingId: binding.id }),
      );
    } finally {
      await act(async () => root.unmount());
    }
  },
);

it("loads the matching source when a project has repositories on both platforms", async () => {
  const gitlab = { ...bindings[0], id: "gitlab", provider: "gitlab" as const };
  localStorage.setItem(
    "agent-hub.taskView",
    JSON.stringify({
      provider: "gitlab",
      projectId: gitlab.project_id,
      filters: {},
    }),
  );
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "task_bindings") return [bindings[0], gitlab];
    if (command === "task_list")
      return { items: [], identity: "demo", has_more: false, limited: false };
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TaskBrowser projects={projects} />
        </MemoryRouter>,
      ),
    );
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain("tasks.empty");
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      "task_list",
      expect.objectContaining({ bindingId: gitlab.id }),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[role="combobox"][aria-label="tasks.project"]',
        )!
        .click(),
    );
    const project = [...document.querySelectorAll('[role="option"]')].find(
      (option) => option.textContent === "Project 0",
    )!;
    expect(
      project.querySelector('[role="img"]')?.getAttribute("aria-label"),
    ).toBe("GitHub / GitLab");
  } finally {
    await act(async () => root.unmount());
  }
});

it("merges selected projects, restores them, and isolates platform mismatches", async () => {
  const selectedBindings: TaskBinding[] = [
    bindings[0],
    { ...bindings[1], provider: "gitlab" },
  ];
  localStorage.setItem(
    "agent-hub.taskView",
    JSON.stringify({
      provider: "all",
      projectIds: ["project-0"],
      filters: {},
    }),
  );
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "task_bindings") return selectedBindings;
    if (command === "task_list") {
      const binding = selectedBindings.find(
        (binding) =>
          args && "bindingId" in args && args.bindingId === binding.id,
      )!;
      return {
        identity: "demo",
        has_more: false,
        limited: false,
        items: [
          {
            key: binding.id,
            binding_id: binding.id,
            project_id: binding.project_id,
            provider: binding.provider,
            host: binding.host,
            repository: binding.repository,
            kind: "issue",
            number: 1,
            title: `Task ${binding.project_id}`,
            state: "open",
            updated_at: "2026-01-01T00:00:00Z",
            assignees: [],
            url: "https://example.invalid/task",
          },
        ],
      };
    }
  });
  const host = document.createElement("div");
  document.body.append(host);
  let root = createRoot(host);
  const render = () =>
    act(async () =>
      root.render(
        <MemoryRouter>
          <TaskBrowser projects={projects} />
        </MemoryRouter>,
      ),
    );
  const menu = () =>
    host.querySelector<HTMLButtonElement>(
      '[role="combobox"][aria-label="tasks.project"]',
    )!;
  const option = (name: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (item) => item.textContent === name,
    )!;
  try {
    await render();
    await act(async () => menu().click());
    expect(
      option("Project 0")
        .querySelector('[role="img"]')
        ?.getAttribute("aria-label"),
    ).toBe("GitHub");
    expect(
      option("Project 2")
        .querySelector('[role="img"]')
        ?.getAttribute("aria-label"),
    ).toBe("GitLab");
    expect(
      option("Project 1")
        .querySelector('[role="img"]')
        ?.getAttribute("aria-label"),
    ).toBe("tasks.project");
    expect(option("Project 0").disabled).toBe(true);
    await act(async () => option("Project 2").click());
    expect(menu().textContent).toBe("Project 0, Project 2");
    expect(option("Project 0").getAttribute("aria-selected")).toBe("true");
    expect(option("Project 2").getAttribute("aria-selected")).toBe("true");
    expect(host.textContent).toContain("Task project-0");
    expect(host.textContent).toContain("Task project-2");
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    expect(menu().textContent).toBe("Project 0, Project 2");
    vi.mocked(invoke).mockClear();
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[role="radio"][aria-label="GitLab"]',
        )!
        .click(),
    );
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).not.toContain("tasks.providerMismatch");
    expect(host.textContent).toContain("Task project-2");
    expect(host.textContent).not.toContain("Task project-0");
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(([command]) => command === "task_list")
        .map(([, args]) => args),
    ).toEqual([expect.objectContaining({ bindingId: "binding-2" })]);
    await act(async () => menu().click());
    await act(async () => option("Project 0").click());
    expect(menu().textContent).toBe("Project 2");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await act(async () => option("tasks.allProjects").click());
    expect(menu().textContent).toBe("tasks.allProjects");
    expect(
      JSON.parse(localStorage.getItem("agent-hub.taskView")!).projectIds,
    ).toEqual([]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
