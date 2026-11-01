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
  useTranslation: () => ({ t: (key: string) => key }),
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
      projectId: "project-1",
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
      projectId: "all",
    },
  );
  await act(async () => root.unmount());
});
