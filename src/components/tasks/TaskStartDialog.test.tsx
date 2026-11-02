// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { makeProject, makeTool } from "../../../tests/fixtures/workspace";
import { makeRepositoryTask } from "../../../tests/fixtures/repositoryTask";
import { createManagedSkill } from "../../../tests/fixtures/managedSkill";
import {
  readTaskStartPreferences,
  saveTaskStartPreferences,
  defaultTaskStartPreferences,
} from "../../lib/taskStartPreferences";
import { TaskStartDialog } from "./TaskStartDialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
}));
const source = {
  path: "/projects/demo",
  branch: "main",
  head: "abcdef",
  is_main: true,
  locked: false,
  available: true,
};
vi.mock("../../hooks/useProjectWorktrees", () => ({
  useProjectWorktrees: () => ({
    worktrees: [source],
    loading: false,
    error: "",
  }),
  refreshProjectWorktrees: vi.fn(async () => {}),
}));
const project = { ...makeProject(), path: source.path };
const target = {
  session: "agent-hub-agents",
  workspace_id: "w1",
  pane_id: "w1:p1",
  terminal_id: "native-1",
  revision: 1,
  agent_session: null,
};
const agent = {
  ...target,
  pane_id: "w1:p2",
  terminal_id: "native-2",
  agent_session: "agent-session",
};
const createdPath = "/projects/demo-issue-7";
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute("open");
      },
    },
  });
  vi.mocked(invoke).mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function Location() {
  const location = useLocation();
  return (
    <output>
      {JSON.stringify({
        path: location.pathname + location.search,
        state: location.state,
      })}
    </output>
  );
}
async function submit() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

it.each(["review", "repair", "ci", "merge"] as const)(
  "previews and explicitly launches the selected %s operation for the exact MR",
  async (action) => {
    const task = makeRepositoryTask({ project_id: project.id });
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "get_managed_skills" || command === "get_project_skills")
        return [];
      if (command === "task_detail")
        return {
          summary: task,
          body: "Current MR requirements",
          comments: [],
          has_more_comments: false,
        };
      if (command === "get_tool_status") return [makeTool("codex")];
      if (command === "herdr_inventory")
        return { installed: true, sessions: [] };
      if (command === "task_prepare_herdr_workspace")
        return { project_id: project.id, path: source.path, target };
      if (command === "herdr_start_agent")
        return { target: agent, warning: null };
      if (command === "herdr_open")
        return { project_id: project.id, path: source.path, target: agent };
    });
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TaskStartDialog
            task={task}
            action={action}
            projects={[project]}
            onClose={vi.fn()}
          />
        </MemoryRouter>,
      ),
    );
    const preview = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="herdr.initialTask"]',
    )!.value;
    expect(preview).toContain(`tasks.reviewActions.prompt.${action}`);
    expect(preview).toContain("tasks.reviewActions.instructions");
    expect(preview).toContain(task.url);
    expect(preview).not.toContain("tasks.launch.promptInstruction");
    expect(
      vi
        .mocked(invoke)
        .mock.calls.some(([command]) => command === "herdr_start_agent"),
    ).toBe(false);
    await submit();
    expect(invoke).toHaveBeenCalledWith(
      "herdr_start_agent",
      expect.objectContaining({
        input: expect.objectContaining({ prompt: preview }),
      }),
    );
    expect(readTaskStartPreferences(project.id).promptTemplate).toBeNull();
    expect(
      vi
        .mocked(invoke)
        .mock.calls.some(([command]) => command === "create_project_worktree"),
    ).toBe(false);
  },
);

it.each(["github", "gitlab"] as const)(
  "starts the %s task in the selected worktree by default without creating a checkout",
  async (provider) => {
    const task = makeRepositoryTask({
      project_id: project.id,
      kind: "issue",
      provider,
    });
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "get_managed_skills" || command === "get_project_skills")
        return [];
      if (command === "task_detail")
        return {
          summary: task,
          body: "Acceptance criteria",
          comments: [],
          has_more_comments: false,
        };
      if (command === "get_tool_status")
        return [
          makeTool("codex"),
          { ...makeTool("claude_code"), installed: false },
        ];
      if (command === "herdr_inventory")
        return { installed: true, sessions: [] };
      if (command === "create_project_worktree")
        return {
          ...source,
          path: createdPath,
          branch: "issue-7",
          is_main: false,
        };
      if (command === "task_prepare_herdr_workspace")
        return { project_id: project.id, path: source.path, target };
      if (command === "herdr_start_agent") {
        expect(args).toMatchObject({
          target,
          input: {
            kind: "codex",
            prompt: expect.stringContaining("Acceptance criteria"),
          },
        });
        return { target: agent, warning: null };
      }
      if (command === "herdr_open")
        return { project_id: project.id, path: source.path, target: agent };
      return undefined;
    });
    const close = vi.fn();
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TaskStartDialog task={task} projects={[project]} onClose={close} />
          <Location />
        </MemoryRouter>,
      ),
    );
    expect(host.querySelector("dialog")?.hasAttribute("open")).toBe(true);
    expect(
      vi
        .mocked(invoke)
        .mock.calls.some(([command]) => command === "herdr_start_agent"),
    ).toBe(false);
    expect(
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(false);
    await submit();
    expect(
      vi
        .mocked(invoke)
        .mock.calls.some(([command]) => command === "create_project_worktree"),
    ).toBe(false);
    expect(invoke).toHaveBeenCalledWith("task_prepare_herdr_workspace", {
      projectId: project.id,
      path: source.path,
    });
    expect(invoke).toHaveBeenCalledWith(
      "herdr_open",
      expect.objectContaining({ paneId: agent.pane_id }),
    );
    const location = JSON.parse(host.querySelector("output")!.textContent!);
    expect(location.path).toBe("/project/demo?worktree=%2Fprojects%2Fdemo");
    expect(location.state.herdrAttachment.target).toEqual(agent);
    expect(close).toHaveBeenCalledOnce();
  },
);

it("reuses a created worktree after preparation failure and blocks duplicate Agent launches after uncertain startup", async () => {
  const task = makeRepositoryTask({ project_id: project.id, kind: "issue" });
  let prepareCount = 0;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "get_managed_skills" || command === "get_project_skills")
      return [];
    if (command === "task_detail")
      return {
        summary: task,
        body: "Acceptance criteria",
        comments: [],
        has_more_comments: false,
      };
    if (command === "get_tool_status") return [makeTool("codex")];
    if (command === "herdr_inventory") return { installed: true, sessions: [] };
    if (command === "create_project_worktree")
      return { ...source, path: createdPath };
    if (command === "task_prepare_herdr_workspace") {
      if (++prepareCount === 1) throw new Error("Session not ready");
      return { project_id: project.id, path: createdPath, target };
    }
    if (command === "herdr_start_agent")
      return { target: agent, warning: "Inspect startup before retrying" };
    if (command === "herdr_open")
      return { project_id: project.id, path: createdPath, target: agent };
    return undefined;
  });
  const close = vi.fn();
  await act(async () =>
    root.render(
      <MemoryRouter>
        <TaskStartDialog task={task} projects={[project]} onClose={close} />
      </MemoryRouter>,
    ),
  );
  await act(async () =>
    host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  await submit();
  expect(host.textContent).toContain("Session not ready");
  await submit();
  expect(host.textContent).toContain("Inspect startup before retrying");
  expect(close).not.toHaveBeenCalled();
  await submit();
  expect(
    vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "create_project_worktree"),
  ).toHaveLength(1);
  expect(
    vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "herdr_start_agent"),
  ).toHaveLength(1);
  expect(close).toHaveBeenCalledOnce();
});

it("remembers reusable choices on close while refreshing issue context and Agent identity", async () => {
  let task = makeRepositoryTask({
    project_id: project.id,
    kind: "issue",
    number: 7,
  });
  const skill = createManagedSkill({
    id: "review",
    name: "review",
    central_path: "/projects/library/review",
  });
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "task_detail")
      return {
        summary: task,
        body: `Acceptance ${task.number}`,
        comments: [],
        has_more_comments: false,
      };
    if (command === "get_managed_skills") return [skill];
    if (command === "get_project_skills") return [];
    if (command === "get_tool_status")
      return [makeTool("codex"), makeTool("claude_code")];
    if (command === "herdr_inventory")
      return { installed: true, sessions: [{ name: "runner", running: true }] };
    if (command === "herdr_ensure")
      return { project_id: project.id, path: source.path, target };
    if (command === "herdr_start_agent")
      return { target: agent, warning: null };
    if (command === "herdr_open")
      return { project_id: project.id, path: source.path, target: agent };
  });
  const close = vi.fn();
  const render = () =>
    act(async () =>
      root.render(
        <MemoryRouter>
          <TaskStartDialog
            key={task.number}
            task={task}
            projects={[project, { ...project, id: "other" }]}
            onClose={close}
          />
        </MemoryRouter>,
      ),
    );
  await render();
  expect(
    host.querySelector('[role="combobox"][aria-label="tasks.project"]'),
  ).toBeNull();
  const originalName = host.querySelector<HTMLInputElement>(
    'input[aria-label="herdr.agentName"]',
  )!.value;
  await act(async () =>
    host
      .querySelector<HTMLInputElement>('fieldset input[type="checkbox"]')!
      .click(),
  );
  const change = async (selector: string, value: string) =>
    act(async () => {
      const node = host.querySelector<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >(selector)!;
      const prototype =
        node.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLSelectElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
        node,
        value,
      );
      node.dispatchEvent(
        new Event(node.tagName === "TEXTAREA" ? "input" : "change", {
          bubbles: true,
        }),
      );
    });
  await change('select[aria-label="herdr.agentType"]', "claude");
  await change('select[aria-label="herdr.session"]', "runner");
  await change(
    'textarea[aria-label="tasks.launch.promptTemplate"]',
    "Use regression checks",
  );
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="install.gitBrowser.close"]',
      )!
      .click(),
  );
  const saved = readTaskStartPreferences(project.id);
  expect(saved).toMatchObject({
    session: "runner",
    agentKind: "claude",
    promptTemplate: "Use regression checks",
    skills: [{ id: "library:review" }],
  });
  expect(JSON.stringify(saved)).not.toContain("Acceptance 7");
  expect(JSON.stringify(saved)).not.toContain(originalName);
  task = { ...task, key: "demo/8", number: 8 };
  await render();
  const prompt = host.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="herdr.initialTask"]',
  )!;
  expect(prompt.readOnly).toBe(true);
  expect(prompt.value).toContain("Use regression checks");
  expect(prompt.value).toContain("/projects/library/review/SKILL.md");
  expect(prompt.value).toContain("Acceptance 8");
  expect(prompt.value).not.toContain("Acceptance 7");
  const newName = host.querySelector<HTMLInputElement>(
    'input[aria-label="herdr.agentName"]',
  )!.value;
  expect(newName).not.toBe(originalName);
  await submit();
  expect(invoke).toHaveBeenCalledWith(
    "herdr_start_agent",
    expect.objectContaining({
      input: expect.objectContaining({
        kind: "claude",
        name: newName,
        prompt: prompt.value,
      }),
    }),
  );
});

it("blocks a missing saved Skill and lets the user remove it before starting", async () => {
  saveTaskStartPreferences(project.id, {
    ...defaultTaskStartPreferences,
    skills: [
      {
        id: "library:missing",
        name: "removed-skill",
        entryPath: "/projects/removed/SKILL.md",
        source: "library",
      },
    ],
  });
  const task = makeRepositoryTask({ project_id: project.id, kind: "issue" });
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "task_detail")
      return {
        summary: task,
        body: "Acceptance",
        comments: [],
        has_more_comments: false,
      };
    if (command === "get_managed_skills" || command === "get_project_skills")
      return [];
    if (command === "get_tool_status") return [makeTool("codex")];
    if (command === "herdr_inventory") return { installed: true, sessions: [] };
  });
  await act(async () =>
    root.render(
      <MemoryRouter>
        <TaskStartDialog task={task} projects={[project]} onClose={vi.fn()} />
      </MemoryRouter>,
    ),
  );
  expect(
    host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled,
  ).toBe(true);
  await submit();
  expect(
    vi
      .mocked(invoke)
      .mock.calls.some(([command]) => command === "herdr_start_agent"),
  ).toBe(false);
  await act(async () =>
    host.querySelector<HTMLButtonElement>("fieldset button")!.click(),
  );
  expect(
    host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled,
  ).toBe(false);
  expect(
    host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="herdr.initialTask"]',
    )!.value,
  ).not.toContain("removed-skill");
});
