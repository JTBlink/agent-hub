// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createInstance } from "i18next";
import zh from "../../i18n/zh.json";
import { makeProject } from "../../../tests/fixtures/workspace";
import {
  createTerminalTab,
  readTerminalLayout,
  writeTerminalLayout,
  terminalScopeKey,
} from "../../lib/terminalLayout";
import type { Project } from "../../lib/tauri";
import { worktreeUrl } from "../../lib/worktreeApi";
import { TerminalWorkspace } from "./TerminalWorkspace";

const i18n = createInstance();
await i18n.init({
  lng: "zh",
  resources: { zh: { translation: zh } },
  interpolation: { escapeValue: false },
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), Channel: class {} }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
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

let root: Root;
let host: HTMLDivElement;
let serial: number;
const project = makeProject();
const topic = "<workspace>/topic";
const creations = () =>
  vi.mocked(invoke).mock.calls.filter(([name]) => name === "terminal_create");
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  serial = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "terminal_list") return [];
    if (command === "terminal_create")
      return {
        id: `new-${++serial}`,
        cwd:
          args && typeof args === "object" && "worktreePath" in args
            ? args.worktreePath
            : project.path,
      };
    if (command === "terminal_project_directory") return project.path;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function RouteMarker() {
  const location = useLocation();
  return (
    <output>
      {location.pathname}
      {location.search}
    </output>
  );
}
async function render(
  path = "/",
  projects: Project[] = [project],
  ready = true,
) {
  await act(async () =>
    root.render(
      <StrictMode>
        <MemoryRouter initialEntries={[path]}>
          <RouteMarker />
          {projects.map((project) => (
            <Link key={project.id} to={worktreeUrl(project.id, project.path)}>
              {`Open ${project.id}`}
            </Link>
          ))}
          <TerminalWorkspace projects={projects} projectsReady={ready} />
        </MemoryRouter>
      </StrictMode>,
    ),
  );
}
async function click(label: string) {
  const element = [...document.querySelectorAll<HTMLElement>("button, a")].find(
    (button) =>
      button.getAttribute("aria-label") === label ||
      button.textContent === label,
  );
  expect(element, label).toBeDefined();
  await act(async () => element?.click());
}
function savedTabs() {
  const main = createTerminalTab(project.id, undefined, project.path);
  main.panes.push("second-pane");
  main.activePane = "second-pane";
  main.direction = "vertical";
  const other = createTerminalTab(project.id, undefined, topic);
  writeTerminalLayout({
    tabs: [main, other],
    activeIds: {
      [terminalScopeKey(project.id, project.path)]: main.id,
      [terminalScopeKey(project.id, topic)]: other.id,
    },
    lastActiveId: other.id,
  });
  return [main, other];
}

it("restores worktree tabs, split layout and the last location after restarting without replaying commands", async () => {
  const [main, other] = savedTabs();
  await render();
  expect(creations()).toHaveLength(3);
  expect(host.querySelector("output")?.textContent).toBe(
    worktreeUrl(project.id, topic),
  );
  expect(readTerminalLayout().tabs).toEqual([main, other]);
  expect(
    host.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  ).toContain("终端 1");
  const sessionsTrigger = host.querySelector<HTMLButtonElement>(
    '[aria-label="全部终端 3/8"]',
  )!;
  expect(sessionsTrigger.textContent).toBe("3");
  expect(sessionsTrigger.title).toBe("全部终端 3/8");
  await click("全部终端 3/8");
  expect(
    document.querySelector('[aria-label="所有项目的终端"]')?.textContent,
  ).toContain(project.path);
  expect(
    document.querySelector('[aria-label="所有项目的终端"]')?.textContent,
  ).toContain(topic);
  await click(`切换到 ${project.name} · 终端 1 · ${project.path}`);
  expect(host.querySelector("output")?.textContent).toBe(
    worktreeUrl(project.id, project.path),
  );
  expect(
    host.querySelectorAll('[role="tabpanel"]:not([hidden]) textarea'),
  ).toHaveLength(2);
  expect(
    host
      .querySelector('[role="tabpanel"]:not([hidden])')
      ?.classList.contains("flex-col"),
  ).toBe(true);
  expect(readTerminalLayout().lastActiveId).toBe(main.id);
  expect(
    vi.mocked(invoke).mock.calls.some(([name]) => name === "terminal_write"),
  ).toBe(false);

  await act(async () => root.unmount());
  root = createRoot(host);
  await render();
  expect(host.querySelector("output")?.textContent).toBe(
    worktreeUrl(project.id, project.path),
  );
  expect(creations()).toHaveLength(6);
  expect(
    host.querySelectorAll('[role="tabpanel"]:not([hidden]) textarea'),
  ).toHaveLength(2);
  await click("全部终端 3/8");
  const overview = document.querySelector<HTMLElement>(
    '[aria-label="所有项目的终端"]',
  )!;
  await act(async () =>
    overview.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(document.querySelector('[aria-label="所有项目的终端"]')).toBeNull();
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "全部终端 3/8",
  );
});

it("waits for projects and all eight leftover PTYs to close before recreating saved panes", async () => {
  const tabs = Array.from({ length: 8 }, () =>
    createTerminalTab(project.id, undefined, topic),
  );
  writeTerminalLayout({ tabs, activeIds: {}, lastActiveId: tabs[0].id });
  const release: Array<() => void> = [];
  const base = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation(async (command, args, options) => {
    if (command === "terminal_list")
      return Array.from({ length: 8 }, (_, i) => ({
        id: `old-${i}`,
        project_id: project.id,
        cwd: topic,
        exited: false,
      }));
    if (
      command === "terminal_close" &&
      args &&
      typeof args === "object" &&
      "id" in args &&
      String(args.id).startsWith("old-")
    ) {
      return new Promise<void>((resolve) => release.push(resolve));
    }
    return base(command, args, options);
  });
  await render("/", [], false);
  expect(invoke).not.toHaveBeenCalled();
  await render();
  expect(release).toHaveLength(8);
  expect(creations()).toHaveLength(0);
  await act(async () => release.forEach((resolve) => resolve()));
  expect(creations()).toHaveLength(8);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(
    host.querySelector<HTMLButtonElement>('[aria-label="新建终端或 Agent"]')
      ?.disabled,
  ).toBe(true);
  await click("全部终端 8/8");
  expect(
    document.querySelectorAll('[aria-label="所有项目的终端"] button[title]'),
  ).toHaveLength(8);
  await click(`关闭 ${project.name} · 终端 1 · ${topic}`);
  expect(readTerminalLayout().tabs).toHaveLength(7);
  expect(
    host.querySelector<HTMLButtonElement>('[aria-label="新建终端或 Agent"]')
      ?.disabled,
  ).toBe(false);
  await click("新建终端或 Agent");
  const item = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ].find((item) => item.textContent === "新建终端")!;
  await act(async () => item.click());
  expect(creations()).toHaveLength(9);
  expect(readTerminalLayout().tabs).toHaveLength(8);
});

it("keeps the saved layout when startup reconciliation fails and allows retry", async () => {
  savedTabs();
  vi.mocked(invoke).mockRejectedValueOnce(
    new Error("Cannot read terminal sessions"),
  );
  await render(worktreeUrl(project.id, topic));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Cannot read terminal sessions",
  );
  expect(creations()).toHaveLength(0);
  expect(readTerminalLayout().tabs).toHaveLength(2);
  await click("重试");
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(creations()).toHaveLength(3);
});

it("does not reopen removed projects or unavailable worktrees", async () => {
  const [main, other] = savedTabs();
  const removed = createTerminalTab(
    "removed",
    undefined,
    "<workspace>/removed",
  );
  writeTerminalLayout({
    tabs: [main, other, removed],
    activeIds: {},
    lastActiveId: other.id,
  });
  const base = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation(async (command, args, options) => {
    if (
      command === "terminal_project_directory" &&
      args &&
      typeof args === "object" &&
      "worktreePath" in args &&
      args.worktreePath === topic
    )
      throw new Error("Worktree unavailable");
    return base(command, args, options);
  });
  await render();
  expect(creations()).toHaveLength(2);
  expect(readTerminalLayout().tabs).toEqual([main]);
  expect(host.querySelector("output")?.textContent).toBe(
    worktreeUrl(project.id, project.path),
  );
});

it("closes all panes of the previous project, frees capacity and opens a fresh shell when returning", async () => {
  const other = {
    ...makeProject(),
    id: "other",
    name: "Other",
    path: "<workspace>/other",
  };
  const tabs = Array.from({ length: 4 }, (_, index) => {
    const tab = createTerminalTab(
      project.id,
      undefined,
      index < 2 ? project.path : topic,
    );
    tab.panes.push(`split-${index}`);
    return tab;
  });
  writeTerminalLayout({ tabs, activeIds: {}, lastActiveId: tabs[0].id });
  await render(worktreeUrl(project.id, project.path), [project, other]);
  expect(creations()).toHaveLength(8);
  const release: Array<() => void> = [];
  const base = vi.mocked(invoke).getMockImplementation()!;
  vi.mocked(invoke).mockImplementation((command, args, options) => {
    if (command === "terminal_close")
      return new Promise<void>((resolve) => release.push(resolve));
    return base(command, args, options);
  });
  await click(`Open ${other.id}`);
  expect(creations()).toHaveLength(8);
  expect(release).toHaveLength(8);
  await act(async () => release.forEach((resolve) => resolve()));
  vi.mocked(invoke).mockImplementation(base);
  expect(creations()).toHaveLength(9);
  const closures = vi
    .mocked(invoke)
    .mock.calls.filter(([command]) => command === "terminal_close")
    .map(([, args]) => args);
  expect(closures).toEqual(
    Array.from({ length: 8 }, (_, i) => ({ id: `new-${i + 1}` })),
  );
  expect(readTerminalLayout().tabs.map((tab) => tab.projectId)).toEqual([
    other.id,
  ]);
  expect(host.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
  await click("全部终端 1/8");
  expect(
    document.querySelector('[aria-label="所有项目的终端"]')?.textContent,
  ).not.toContain(project.name);
  await click("全部终端 1/8");
  await click(`Open ${project.id}`);
  expect(creations()).toHaveLength(10);
  expect(invoke).toHaveBeenCalledWith("terminal_close", { id: "new-9" });
  expect(readTerminalLayout().tabs).toHaveLength(1);
  expect(readTerminalLayout().tabs[0].id).not.toBe(tabs[0].id);
});

it("restores only the selected project from an older layout containing multiple projects", async () => {
  const other = {
    ...makeProject(),
    id: "other",
    name: "Other",
    path: "<workspace>/other",
  };
  const [main, checkout] = savedTabs();
  const foreign = createTerminalTab(other.id, undefined, other.path);
  writeTerminalLayout({
    tabs: [main, checkout, foreign],
    activeIds: {},
    lastActiveId: foreign.id,
  });
  await render(worktreeUrl(project.id, project.path), [project, other]);
  expect(creations()).toHaveLength(3);
  expect(
    creations().every(
      ([, args]) =>
        args &&
        typeof args === "object" &&
        "projectId" in args &&
        args.projectId === project.id,
    ),
  ).toBe(true);
  expect(readTerminalLayout().tabs).toEqual([main, checkout]);
});
