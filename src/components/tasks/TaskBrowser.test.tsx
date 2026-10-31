// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { RepositoryTask, TaskBinding } from "../../lib/tauri";
import { TaskBrowser } from "./TaskBrowser";
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
