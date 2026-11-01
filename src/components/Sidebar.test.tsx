// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import en from "../i18n/en.json";
import zhTW from "../i18n/zh-TW.json";
import { makeSkillGroup } from "../../tests/fixtures/skillGroup";
import type { SkillGroup } from "../lib/tauri";
import { makeTool, makeProject } from "../../tests/fixtures/workspace";
import { WorkspaceFilesProvider } from "./worktree/WorkspaceFilesContext";
import { createTerminalTab, writeTerminalLayout } from "../lib/terminalLayout";
import { SidebarVisibilityContext } from "../hooks/sidebarVisibility";
import { Sidebar } from "./Sidebar";
import { workspaceSkillsCache } from "../lib/workspaceSkillsCache";

const worktreeMocks = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue([]),
}));
vi.mock("../lib/worktreeApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/worktreeApi")>()),
  getProjectWorktrees: worktreeMocks.list,
  getWorktreeFiles: vi.fn().mockResolvedValue([]),
}));
vi.mock("../lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/tauri")>()),
  getGlobalLocalSkills: vi.fn().mockResolvedValue([]),
  touchProjectVisited: vi.fn().mockResolvedValue(undefined),
}));

const app = vi.hoisted(() => ({
  skillGroups: [] as SkillGroup[],
  managedSkills: [],
  projects: [],
  tools: [],
  viewedSkillGroup: null as SkillGroup | null,
  viewingUngrouped: false,
  appUpdate: null,
  setViewedSkillGroupId: vi.fn(),
  setViewingUngrouped: vi.fn(),
  closeSkillDetail: vi.fn(),
  refreshSkillGroups: vi.fn(),
  refreshManagedSkills: vi.fn(),
  refreshProjects: vi.fn(),
  openSearch: vi.fn(),
}));
vi.mock("../context/AppContext", () => ({ useApp: () => app }));
vi.mock("../i18n", () => ({ default: { t: (key: string) => key } }));
const i18n = createInstance();
await i18n.init({
  lng: "zh",
  resources: {
    zh: { translation: zh },
    en: { translation: en },
    "zh-TW": { translation: zhTW },
  },
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  vi.clearAllMocks();
  workspaceSkillsCache.clear();
  await i18n.changeLanguage("zh");
  app.skillGroups = [];
  app.tools = [];
  app.projects = [];
  localStorage.clear();
  app.viewedSkillGroup = null;
  app.viewingUngrouped = false;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function Navigation() {
  const navigate = useNavigate();
  return (
    <>
      <output>{useLocation().pathname}</output>
      <button onClick={() => navigate("/project/demo")}>Go project</button>
      <button onClick={() => navigate("/settings")}>Go settings</button>
      <button onClick={() => navigate(-1)}>Go back</button>
      {[
        "/",
        "/discover",
        "/install",
        "/tasks",
        "/automation",
        "/backup",
        "/settings",
        "/help",
      ].map((path) => (
        <button
          key={path}
          onClick={() => navigate(path)}
        >{`Go ${path}`}</button>
      ))}
    </>
  );
}

function TestSidebar() {
  const [resourcePanelVisible, setResourcePanelVisible] = useState(false);
  return (
    <SidebarVisibilityContext.Provider
      value={{ resourcePanelVisible, setResourcePanelVisible }}
    >
      <Sidebar />
      <div data-resource-visible={String(resourcePanelVisible)} />
    </SidebarVisibilityContext.Provider>
  );
}

async function render(path = "/global-workspace/codex") {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <WorkspaceFilesProvider>
          <TestSidebar />
        </WorkspaceFilesProvider>
        <Navigation />
      </MemoryRouter>,
    ),
  );
}

function button(name: string) {
  const button = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((element) => element.textContent === name);
  if (!button) throw new Error(`Missing button ${name}`);
  return button;
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
}

it("provides a permanent automation entry independent of installed agents", async () => {
  await render();
  const link = container.querySelector<HTMLAnchorElement>(
    'a[href="/automation"]',
  )!;
  expect(link.textContent).toBe("自动化");
  await click(link);
  expect(container.querySelector("output")?.textContent).toBe("/automation");
});

it("keeps primary navigation in the activity bar with labelled, active links", async () => {
  await render("/");
  const navigation = container.querySelector('nav[aria-label="主导航"]')!;
  const entries = [...navigation.querySelectorAll("a")].map((element) =>
    element.getAttribute("aria-label"),
  );
  expect(entries).toEqual([
    "Git",
    "任务",
    "自动化",
    "发现",
    "工作台",
    "云端同步",
    "设置",
  ]);
  for (const link of navigation.querySelectorAll("a")) {
    expect(link.title).toBe(link.getAttribute("aria-label"));
  }
  expect(navigation.querySelector('[aria-current="page"]')?.textContent).toBe(
    "工作台",
  );
  const tasks = container.querySelector<HTMLAnchorElement>('a[href="/tasks"]')!;
  await click(tasks);
  expect(container.querySelector("output")?.textContent).toBe("/tasks");
  expect(tasks.getAttribute("aria-current")).toBe("page");
  expect(container.querySelector('a[href="/terminal"]')).toBeNull();
});

it("places project, search and Git first and opens search without navigating", async () => {
  await render("/tasks");
  const navigation = container.querySelector('nav[aria-label="主导航"]')!;
  const entries = [...navigation.querySelectorAll("button, a")];
  expect(
    entries.slice(0, 3).map((entry) => entry.getAttribute("aria-label")),
  ).toEqual([zh.sidebar.projects, zh.workspaceSearch.title, "Git"]);
  await click(entries[1] as HTMLElement);
  expect(app.openSearch).not.toHaveBeenCalled();
  expect(
    container.querySelector("[data-workspace-search-input]"),
  ).not.toBeNull();
  expect(container.querySelector("output")?.textContent).toBe("/tasks");
  expect(
    navigation
      .querySelector('[aria-current="page"]')
      ?.getAttribute("aria-label"),
  ).toBe(zh.workspaceSearch.title);
});

function explorer() {
  return (container.querySelector<HTMLButtonElement>(
    `button[data-sidebar-panel][aria-current="page"]`,
  ) ??
    container.querySelector<HTMLButtonElement>(
      `button[data-sidebar-panel="skills"]`,
    ))!;
}

it("hides the dashboard resource panel until requested and hides it again on return", async () => {
  await render("/");
  const toggle = explorer();
  const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
  expect(getComputedStyle(panel).display).toBe("none");
  await click(toggle);
  expect(getComputedStyle(panel).display).not.toBe("none");
  await click(button("Go settings"));
  expect(getComputedStyle(panel).display).toBe("none");
  await click(button("Go back"));
  expect(container.querySelector("output")?.textContent).toBe("/my-skills");
  expect(getComputedStyle(panel).display).not.toBe("none");
  await click(button("Go /"));
  expect(getComputedStyle(panel).display).toBe("none");
  expect(localStorage.getItem("agent-hub:sidebar-panel-open")).toBe("true");
});

it.each([
  "/",
  "/discover",
  "/install",
  "/tasks",
  "/automation",
  "/backup",
  "/settings",
  "/help",
])(
  "automatically hides resource panels on %s without changing the width or open preference",
  async (path) => {
    localStorage.setItem("agent-hub:sidebar-width", "320");
    await render("/my-skills");
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-sidebar-panel="skills"]',
    )!;
    const panel = document.getElementById(
      toggle.getAttribute("aria-controls")!,
    )!;
    const resize = panel.querySelector('[role="separator"]')!;
    expect(panel.hidden).toBe(false);
    await click(button(`Go ${path}`));
    expect(panel.hidden).toBe(true);
    expect(
      container
        .querySelector("[data-resource-visible]")
        ?.getAttribute("data-resource-visible"),
    ).toBe("false");
    await click(toggle);
    expect(panel.hidden).toBe(false);
    expect(container.querySelector("output")?.textContent).toBe("/my-skills");
    await click(button("Go settings"));
    expect(panel.hidden).toBe(true);
    await click(button("Go project"));
    expect(panel.hidden).toBe(false);
    expect(resize.getAttribute("aria-valuenow")).toBe("320");
    expect(localStorage.getItem("agent-hub:sidebar-width")).toBe("320");
    expect(localStorage.getItem("agent-hub:sidebar-panel-open")).toBe("true");
  },
);

it.each([
  ["/", "工作台"],
  ["/tasks", "任务"],
  ["/automation", "自动化"],
  ["/git", "Git"],
  ["/discover", "发现"],
  ["/install", "发现"],
  ["/backup", "云端同步"],
  ["/settings", "设置"],
  ["/my-skills", "技能面板"],
  ["/project/demo", "项目工作区"],
  ["/project/demo/skills", "项目工作区"],
  ["/global-workspace/codex", "技能面板"],
  ["/lobster-workspace/hermes", "技能面板"],
  ["/terminal", "项目工作区"],
])(
  "selects only %s's activity entry regardless of panel visibility",
  async (path, label) => {
    await render(path);
    const navigation = container.querySelector('nav[aria-label="主导航"]')!;
    const checkSelection = (expected = label) => {
      const selected = navigation.querySelectorAll('[aria-current="page"]');
      expect(selected).toHaveLength(1);
      expect(selected[0].getAttribute("aria-label")).toBe(expected);
    };
    checkSelection();
    const wasOpen = explorer().getAttribute("aria-expanded") === "true";
    await click(explorer());
    expect(explorer().getAttribute("aria-expanded")).toBe(String(!wasOpen));
    const expected = wasOpen ? label : "技能面板";
    checkSelection(expected);
    await click(explorer());
    expect(explorer().getAttribute("aria-expanded")).toBe(String(wasOpen));
    checkSelection(expected);
  },
);

it("moves the single activity selection between Git and workspace routes on navigation and history", async () => {
  await render("/git");
  const navigation = container.querySelector('nav[aria-label="主导航"]')!;
  const selection = () =>
    [...navigation.querySelectorAll('[aria-current="page"]')].map((entry) =>
      entry.getAttribute("aria-label"),
    );
  expect(selection()).toEqual(["Git"]);
  await click(button("Go project"));
  expect(selection()).toEqual(["项目工作区"]);
  await click(button("Go settings"));
  expect(selection()).toEqual(["设置"]);
  await click(button("Go back"));
  expect(selection()).toEqual(["项目工作区"]);
  await click(button("Go back"));
  expect(selection()).toEqual(["Git"]);
});

it.each([
  ["/my-skills", "skills"],
  ["/project/demo", "projects"],
  ["/project/demo", "search"],
])(
  "toggles the active %s / %s panel from its activity icon",
  async (path, panel) => {
    await render(path);
    const trigger = container.querySelector<HTMLButtonElement>(
      `[data-sidebar-panel="${panel}"]`,
    )!;
    if (panel === "search") await click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    app.setViewedSkillGroupId.mockClear();
    app.closeSkillDetail.mockClear();
    await click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem("agent-hub:sidebar-panel-open")).toBe("false");
    expect(container.querySelector("output")?.textContent).toBe(path);
    expect(app.setViewedSkillGroupId).not.toHaveBeenCalled();
    expect(app.closeSkillDetail).not.toHaveBeenCalled();
    await click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(localStorage.getItem("agent-hub:sidebar-panel-open")).toBe("true");
  },
);

it("collapses the skill panel, returns focus to Skills and keeps navigation usable", async () => {
  await render("/my-skills");
  const toggle = explorer();
  const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
  const hide = container.querySelector<HTMLButtonElement>(
    '[aria-label="收起技能面板"]',
  )!;
  hide.focus();
  await click(hide);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(toggle);
  expect(localStorage.getItem("agent-hub:sidebar-panel-open")).toBe("false");
  expect(getComputedStyle(panel).display).toBe("none");
  await click(
    container.querySelector<HTMLAnchorElement>('a[href="/automation"]')!,
  );
  expect(container.querySelector("output")?.textContent).toBe("/automation");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  await click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(localStorage.getItem("agent-hub:sidebar-panel-open")).toBe("true");
});

it("restores the collapsed preference while keeping all resource sections mounted", async () => {
  localStorage.setItem("agent-hub:sidebar-panel-open", "false");
  app.skillGroups = groups(8);
  await render("/my-skills");
  expect(explorer().getAttribute("aria-expanded")).toBe("false");
  await click(explorer());
  expect(explorer().getAttribute("aria-expanded")).toBe("true");
  expect(groupOrder()).toEqual(app.skillGroups.map((group) => group.id));
  await click(
    container.querySelector<HTMLButtonElement>('[aria-label="收起技能面板"]')!,
  );
  await click(explorer());
  expect(groupOrder()).toEqual(app.skillGroups.map((group) => group.id));
});

function expanded() {
  return [
    ...container.querySelectorAll(
      '[aria-expanded="true"]:not([aria-controls])',
    ),
  ].map((element) => element.textContent);
}

it("appends assistants to one workspace with existing orders and working detail routes", async () => {
  // Use real draggable rows and preserve both existing category preferences.
  Object.assign(app, {
    tools: [
      makeTool("hermes", "lobster"),
      makeTool("codex"),
      makeTool("openclaw", "lobster"),
      makeTool("opencode"),
    ],
    projects: [makeProject()],
  });
  localStorage.setItem("agent-hub:tool-order", '["opencode","codex"]');
  localStorage.setItem("agent-hub:lobster-tool-order", '["openclaw","hermes"]');
  await render();
  const rows = [...container.querySelectorAll("[data-rfd-draggable-id]")];
  expect(
    rows.map((element) => element.getAttribute("data-rfd-draggable-id")),
  ).toEqual(["opencode", "codex", "openclaw", "hermes"]);
  expect(container.textContent).not.toContain("全部龙虾 Agent");
  await click(button("hermes"));
  expect(container.querySelector("output")?.textContent).toBe(
    "/lobster-workspace/hermes",
  );
  expect(button("hermes").getAttribute("aria-current")).toBe("page");
  expect(expanded()).toEqual(["Agent 工作区"]);
});

it("opens only the active region on navigation, including history return after a manual toggle", async () => {
  await render("/lobster-workspace/hermes");
  expect(expanded()).toEqual(["Agent 工作区"]);
  await click(
    container.querySelector<HTMLButtonElement>(
      '[data-sidebar-panel="projects"]',
    )!,
  );
  expect(
    container
      .querySelector('[role="group"][aria-label="工作树"]')
      ?.closest("[hidden]"),
  ).toBeNull();
  await click(button("Go settings"));
  expect(expanded()).toEqual([]);
  await click(button("Go back"));
  expect(expanded()).toEqual(["Agent 工作区"]);
  await click(button("Go project"));
  expect(
    container
      .querySelector('[role="group"][aria-label="工作树"]')
      ?.closest("[hidden]"),
  ).toBeNull();
});

it("uses the library title solely to toggle and All Skills to clear both group filters", async () => {
  app.viewedSkillGroup = {
    id: "demo",
    name: "Demo",
    description: null,
    icon: null,
    sort_order: 0,
    skill_count: 0,
    created_at: 1,
    updated_at: 1,
  };
  app.viewingUngrouped = true;
  await render("/settings");
  const heading = button("技能库0");
  expect(heading.textContent).toBe("技能库0");
  await click(heading);
  expect(container.querySelector("output")?.textContent).toBe("/settings");
  expect(app.setViewedSkillGroupId).not.toHaveBeenCalled();
  const allSkills = [
    ...container.querySelectorAll<HTMLAnchorElement>("a"),
  ].find((link) => link.textContent === "全部技能")!;
  expect(allSkills.getAttribute("aria-current")).toBeNull();
  await click(allSkills);
  expect(container.querySelector("output")?.textContent).toBe("/my-skills");
  expect(app.closeSkillDetail).toHaveBeenCalledOnce();
  expect(app.setViewedSkillGroupId).toHaveBeenCalledWith("");
  expect(app.setViewingUngrouped).toHaveBeenCalledWith(false);
  expect(expanded()).toEqual(["技能库0"]);
});

function groups(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...makeSkillGroup(`group-${i}`, `Group ${i}`),
    skill_count: i + 1,
  }));
}
function more() {
  return container.querySelector<HTMLButtonElement>(
    "button[aria-controls][aria-expanded]:not([aria-label])",
  )!;
}
function groupOrder() {
  return [
    ...container.querySelectorAll(
      '[data-rfd-droppable-id="skillGroups"] [data-rfd-draggable-id]',
    ),
  ].map((row) => row.getAttribute("data-rfd-draggable-id"));
}

it.each([0, 5, 6, 13])(
  "shows every skill group without a More toggle (%i groups)",
  async (count) => {
    app.skillGroups = groups(count);
    await render("/my-skills");
    expect(groupOrder()).toEqual(app.skillGroups.map((group) => group.id));
    expect(more()).toBeNull();
  },
);

it.each(["zh", "en", "zh-TW"])(
  "shows all groups directly in %s",
  async (language) => {
    await i18n.changeLanguage(language);
    app.skillGroups = groups(8);
    await render("/my-skills");
    expect(groupOrder()).toEqual(app.skillGroups.map((group) => group.id));
    expect(more()).toBeNull();
  },
);

it("keeps the selected group in its original position without duplicating it", async () => {
  app.skillGroups = groups(8);
  app.viewedSkillGroup = app.skillGroups[7];
  await render("/my-skills");
  expect(button("Group 78").getAttribute("aria-current")).toBe("page");
  expect(groupOrder()).toEqual(app.skillGroups.map((group) => group.id));
  expect(
    [...container.querySelectorAll("button")].filter(
      (item) => item.textContent === "Group 78",
    ),
  ).toHaveLength(1);
  app.viewedSkillGroup = null;
  await render("/my-skills");
  expect(button("Group 78").getAttribute("aria-current")).toBeNull();
});

it("switches directly to a group beyond the first five", async () => {
  app.skillGroups = groups(8);
  await render("/settings");
  await click(button("技能库0"));
  await click(button("Group 78"));
  expect(app.setViewedSkillGroupId).toHaveBeenCalledWith("group-7");
  expect(app.setViewingUngrouped).toHaveBeenCalledWith(false);
  expect(app.closeSkillDetail).toHaveBeenCalledOnce();
  expect(container.querySelector("output")?.textContent).toBe("/my-skills");
  expect(groupOrder()).toEqual(app.skillGroups.map((group) => group.id));
});

it("updates rows when the group count changes", async () => {
  app.skillGroups = groups(8);
  await render("/my-skills");
  app.skillGroups = app.skillGroups.slice(0, 5);
  await render("/my-skills");
  expect(groupOrder()).toEqual(app.skillGroups.map((group) => group.id));
  expect(more()).toBeNull();
  expect(container.textContent).not.toContain("Group 7");
});

it.each(["edit", "delete", "create"])(
  "keeps %s available with all sidebar groups visible",
  async (action) => {
    app.skillGroups = groups(8);
    await render("/my-skills");
    const target =
      action === "create"
        ? button("新建技能组")
        : container.querySelector<HTMLButtonElement>(
            `[aria-label="${action === "edit" ? "编辑" : "删除"} Group 7"]`,
          )!;
    await click(target);
    if (action === "delete")
      expect(
        container.querySelector('[role="alertdialog"]')?.textContent,
      ).toContain("Group 7");
    else
      expect(container.querySelector<HTMLInputElement>("input")?.value).toBe(
        action === "edit" ? "Group 7" : "",
      );
  },
);

it("shows branch controls instead of a second worktree selector", async () => {
  const project = { ...makeProject(), id: "tree-demo" };
  Object.assign(app, { projects: [project] });
  worktreeMocks.list.mockResolvedValueOnce([
    {
      path: project.path,
      branch: "main",
      head: "abc",
      is_main: true,
      locked: false,
      available: true,
    },
  ]);
  await render(`/project/${project.id}`);
  expect(worktreeMocks.list).toHaveBeenCalledWith(project.id);
  expect(
    container.querySelector('[role="combobox"][aria-label="工作树"]'),
  ).toBeNull();
  expect(
    container.querySelector('[aria-label="切换分支"]')?.textContent,
  ).toContain("main");
});

it.each(["/automation", "/global-workspace/codex", "/my-skills"])(
  "opens the complete skill library from the skills activity entry on %s",
  async (path) => {
    localStorage.setItem("agent-hub:sidebar-panel-open", "false");
    app.viewedSkillGroup = makeSkillGroup("previous-group", "Previous group");
    app.viewingUngrouped = true;
    await render(path);
    await click(explorer());
    expect(container.querySelector("output")?.textContent).toBe("/my-skills");
    expect(app.closeSkillDetail).toHaveBeenCalledOnce();
    expect(app.setViewedSkillGroupId).toHaveBeenCalledWith("");
    expect(app.setViewingUngrouped).toHaveBeenCalledWith(false);
    expect(explorer().getAttribute("aria-expanded")).toBe("true");
    expect(
      button("技能库0").compareDocumentPosition(button("Agent 工作区")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  },
);

it("puts Projects first and separates project files from the skills panel", async () => {
  await render("/my-skills");
  const nav = container.querySelector('nav[aria-label="主导航"]')!;
  expect(nav.querySelector("button, a")?.getAttribute("aria-label")).toBe(
    "项目工作区",
  );
  const projectToggle = nav.querySelector<HTMLButtonElement>(
    '[data-sidebar-panel="projects"]',
  )!;
  const skillsToggle = nav.querySelector<HTMLButtonElement>(
    '[data-sidebar-panel="skills"]',
  )!;
  const projectHeading = container.querySelector<HTMLElement>(
    '[role="group"][aria-label="工作树"]',
  )!;
  const skillsHeading = button("Agent 工作区");
  expect(projectHeading.closest("[hidden]")).not.toBeNull();
  expect(skillsHeading.closest("[hidden]")).toBeNull();
  await click(projectToggle);
  expect(projectHeading.closest("[hidden]")).toBeNull();
  expect(skillsHeading.closest("[hidden]")).not.toBeNull();
  expect(projectToggle.getAttribute("aria-current")).toBe("page");
  expect(skillsToggle.getAttribute("aria-current")).toBeNull();
  expect(container.querySelector("output")?.textContent).toBe("/my-skills");
  await click(skillsToggle);
  expect(projectHeading.closest("[hidden]")).not.toBeNull();
  expect(skillsHeading.closest("[hidden]")).toBeNull();
  expect(skillsToggle.getAttribute("aria-expanded")).toBe("true");
  await click(button("Go project"));
  expect(projectHeading.closest("[hidden]")).toBeNull();
  expect(skillsHeading.closest("[hidden]")).not.toBeNull();
});

it("uses the top menu for project switching and keeps the branch controls", async () => {
  const project = { ...makeProject(), id: "menu-project", name: "Demo" };
  Object.assign(app, { projects: [project] });
  await render(`/project/${project.id}`);
  expect(
    container.querySelector('[role="combobox"][aria-label="切换项目"]'),
  ).toBeNull();
  expect(container.querySelector('[aria-label="切换分支"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="刷新工作树"]')).not.toBeNull();
});

it("replaces the Git sidebar when another panel opens and restores Git on its activity click", async () => {
  await render("/git");
  const visible = () =>
    container
      .querySelector("[data-resource-visible]")
      ?.getAttribute("data-resource-visible");
  expect(visible()).toBe("false");
  await click(
    container.querySelector<HTMLButtonElement>(
      '[data-sidebar-panel="projects"]',
    )!,
  );
  expect(visible()).toBe("true");
  await click(
    container.querySelector<HTMLButtonElement>(
      '[data-sidebar-panel="skills"]',
    )!,
  );
  expect(visible()).toBe("true");
  expect(
    container.querySelectorAll('nav button[aria-expanded="true"]'),
  ).toHaveLength(1);
  await click(container.querySelector<HTMLAnchorElement>('a[href="/git"]')!);
  expect(visible()).toBe("false");
  expect(
    container.querySelectorAll('nav button[aria-expanded="true"]'),
  ).toHaveLength(0);
});

it("returns to the last project and checkout when opening the project panel from Git", async () => {
  const first = {
    ...makeProject(),
    id: "remember-first",
    name: "First",
    visited_at: 200,
  };
  const last = {
    ...makeProject(),
    id: "remember-last",
    name: "Last",
    path: "~/projects/last",
    visited_at: 100,
  };
  Object.assign(app, { projects: [first, last] });
  const tab = createTerminalTab(last.id, undefined, "~/projects/topic");
  writeTerminalLayout({ tabs: [tab], lastActiveId: tab.id, activeIds: {} });
  await render("/git");
  expect(
    container.querySelector('[aria-label="移除项目 Last"]'),
  ).not.toBeNull();
  await click(
    container.querySelector<HTMLButtonElement>(
      '[data-sidebar-panel="projects"]',
    )!,
  );
  expect(container.querySelector("output")?.textContent).toBe(
    `/project/${last.id}`,
  );
  expect(
    container
      .querySelector("[data-resource-visible]")
      ?.getAttribute("data-resource-visible"),
  ).toBe("true");
});

it("focuses the workspace search field on repeated shortcuts without opening global commands", async () => {
  await render("/tasks");
  const invokeShortcut = () =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );
  await act(async () => {
    invokeShortcut();
  });
  const input = container.querySelector<HTMLInputElement>(
    "[data-workspace-search-input]",
  )!;
  expect(document.activeElement).toBe(input);
  container
    .querySelector<HTMLButtonElement>('button[data-sidebar-panel="search"]')!
    .focus();
  await act(async () => {
    invokeShortcut();
  });
  expect(document.activeElement).toBe(input);
  expect(app.openSearch).not.toHaveBeenCalled();
});
