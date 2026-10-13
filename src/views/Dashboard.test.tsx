// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import type { ManagedSkill, Project, ToolInfo } from "../lib/tauri";
import { Dashboard } from "./Dashboard";
import { makeSkill } from "../../tests/fixtures/managedSkill";
import { useLocation } from "react-router-dom";

const app = vi.hoisted(() => ({
  managedSkills: [] as ManagedSkill[],
  openSkillDetailById: vi.fn(),
  setViewedSkillGroupId: vi.fn(),
  closeSkillDetail: vi.fn(),
  setViewingUngrouped: vi.fn(),
  loading: false,
  projects: [] as Project[],
  tools: [] as ToolInfo[],
}));
vi.mock("../context/AppContext", () => ({
  useApp: () => app,
}));
vi.mock("../components/AgentControlSetupCard", () => ({
  AgentControlSetupCard: () => null,
}));
vi.mock("../lib/tauri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/tauri")>();
  return { ...actual, touchProjectVisited: vi.fn(() => Promise.resolve()) };
});
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  app.managedSkills = [];
  app.loading = false;
  app.projects = [];
  app.tools = [];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function LibraryDestination() {
  const location = useLocation();
  return <p>Skill library{location.search}</p>;
}

function WorkspaceDestination() {
  return <p>{useLocation().pathname}</p>;
}

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/my-skills" element={<LibraryDestination />} />
          <Route path="*" element={<WorkspaceDestination />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

function card(title: string) {
  const buttons = container.querySelectorAll<HTMLButtonElement>(
    'section[aria-label="技能与部署概览"] button',
  );
  const match = [...buttons].find(
    (button) =>
      document.getElementById(button.getAttribute("aria-labelledby") ?? "")
        ?.textContent === title,
  );
  if (!match) throw new Error(`Missing overview card: ${title}`);
  return match;
}

it("opens the full library undeployed filter without a dialog or a stale group", async () => {
  app.managedSkills = [
    makeSkill(0, true),
    ...Array.from({ length: 14 }, (_, i) => makeSkill(i + 1)),
  ];
  await render();
  const overview = container.querySelector(
    'section[aria-label="技能与部署概览"]',
  )!;
  expect(overview.textContent).toContain("已部署 1 个 · 覆盖率 7%");
  const button = card("待部署");
  expect(button.textContent).toContain("14");
  await act(async () => button.click());
  expect(app.setViewedSkillGroupId).toHaveBeenCalledWith("");
  expect(app.closeSkillDetail).toHaveBeenCalledOnce();
  expect(app.openSkillDetailById).not.toHaveBeenCalled();
  expect(container.textContent).toBe("Skill library?deployment=undeployed");
  expect(container.querySelector("dialog")).toBeNull();
});

it("updates the undeployed entry count when deployment data changes", async () => {
  app.managedSkills = [makeSkill(1), makeSkill(2)];
  await render();
  expect(card("待部署").textContent).toContain("2");
  app.managedSkills = [makeSkill(1, true), makeSkill(2)];
  await render();
  expect(card("待部署").textContent).toContain("1");
  expect(container.querySelector("dialog")).toBeNull();
});

it.each([{ skills: [] }, { skills: [makeSkill(1, true)] }])(
  "disables the library entry when no skills are undeployed",
  async ({ skills }) => {
    app.managedSkills = skills;
    await render();
    const button = card("待部署");
    expect(button.textContent).toContain("0");
    expect(button.disabled).toBe(true);
    expect(container.querySelector("dialog")).toBeNull();
  },
);

it("replaces the duplicate Agent overview with an actionable ungrouped count", async () => {
  app.managedSkills = [
    { ...makeSkill(1), skill_group_ids: [] },
    { ...makeSkill(2, true), skill_group_ids: [] },
    { ...makeSkill(3), skill_group_ids: ["group-a", "group-b"] },
  ];
  await render();
  const overview = container.querySelector(
    'section[aria-label="技能与部署概览"]',
  )!;
  expect(overview.querySelectorAll("button")).toHaveLength(3);
  expect(overview.textContent).not.toContain("已启用 Agent");
  expect(card("待分组").textContent).toContain("2");
  await act(async () => card("待分组").click());
  expect(app.setViewedSkillGroupId).toHaveBeenCalledWith("");
  expect(app.setViewingUngrouped).toHaveBeenCalledWith(false);
  expect(app.closeSkillDetail).toHaveBeenCalledOnce();
  expect(container.textContent).toBe("Skill library?grouping=ungrouped");
});

it("refreshes grouping tasks and disables the entry once all skills are grouped", async () => {
  app.managedSkills = [{ ...makeSkill(1), skill_group_ids: [] }];
  await render();
  expect(card("待分组").disabled).toBe(false);
  app.managedSkills = [makeSkill(1)];
  await render();
  expect(card("待分组").disabled).toBe(true);
  expect(card("待分组").textContent).toContain("当前没有未分组技能");
});

it("opens the whole library instead of retaining a previous group or detail", async () => {
  await render();
  expect(card("技能库").disabled).toBe(false);
  expect(card("待分组").disabled).toBe(true);
  expect(container.textContent).not.toContain("NaN");
  await act(async () => card("技能库").click());
  expect(app.setViewedSkillGroupId).toHaveBeenCalledWith("");
  expect(app.closeSkillDetail).toHaveBeenCalledOnce();
  expect(app.setViewingUngrouped).toHaveBeenCalledWith(false);
  expect(container.textContent).toBe("Skill library");
});

it("does not present pending counts or allow navigation before data is loaded", async () => {
  app.loading = true;
  await render();
  for (const title of ["技能库", "待部署", "待分组"]) {
    expect(card(title).disabled).toBe(true);
    expect(card(title).textContent).toContain("—");
  }
  expect(
    container
      .querySelector('section[aria-label="技能与部署概览"]')
      ?.getAttribute("aria-busy"),
  ).toBe("true");
  app.loading = false;
  await render();
  expect(card("技能库").disabled).toBe(false);
});

it("opens the newest skill from the redesigned recent list", async () => {
  app.managedSkills = Array.from({ length: 7 }, (_, i) => makeSkill(i));
  await render();
  const recent = container.querySelector(
    'section[aria-labelledby="recent-skills-title"]',
  )!;
  const rows = recent.querySelectorAll<HTMLButtonElement>(
    "#dashboard-recent-skills button",
  );
  expect(rows).toHaveLength(3);
  expect(rows[0].textContent).toContain("demo-skill-6");
  expect(rows[0].textContent).toContain("本地");
  expect(rows[0].textContent).toContain("未部署");
  await act(async () => rows[0].click());
  expect(app.setViewedSkillGroupId).toHaveBeenCalledWith("");
  expect(app.openSkillDetailById).toHaveBeenCalledWith("skill-6");
  expect(container.textContent).toBe("Skill library");
});

it("expands and collapses recent skills without changing their order or losing detail navigation", async () => {
  app.managedSkills = Array.from({ length: 7 }, (_, i) => makeSkill(i));
  await render();
  const entries = () =>
    container.querySelectorAll<HTMLButtonElement>(
      "#dashboard-recent-skills button",
    );
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-controls="dashboard-recent-skills"]',
  )!;
  expect(entries()).toHaveLength(3);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(toggle.textContent).toBe("展开另外 2 项");
  await act(async () => toggle.click());
  expect(entries()).toHaveLength(5);
  expect(entries()[4].textContent).toContain("demo-skill-2");
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  await act(async () => toggle.click());
  expect(entries()).toHaveLength(3);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  await act(async () => toggle.click());
  await act(async () => entries()[4].click());
  expect(app.openSkillDetailById).toHaveBeenCalledWith("skill-2");
});

it.each([0, 3])(
  "does not offer expansion for %s recent skills",
  async (count) => {
    app.managedSkills = Array.from({ length: count }, (_, i) => makeSkill(i));
    await render();
    expect(
      container.querySelector(
        'button[aria-controls="dashboard-recent-skills"]',
      ),
    ).toBeNull();
    expect(
      container.querySelectorAll("#dashboard-recent-skills button"),
    ).toHaveLength(count);
  },
);

function project(index: number): Project {
  return {
    id: `project-${index}`,
    name: `demo-project-${index}`,
    path: `<workspace>/project-${index}`,
    workspace_type: "project",
    linked_agent_name: null,
    supports_skill_toggle: true,
    sort_order: index,
    skill_count: index,
    created_at: 1,
    updated_at: 1,
    visited_at: null,
    sync_health: {
      in_sync: 0,
      project_newer: 0,
      center_newer: 0,
      project_only: 0,
      diverged: index === 11 ? 2 : 0,
    },
  };
}

function agent(key: string, category: ToolInfo["category"]): ToolInfo {
  return {
    key,
    category,
    display_name: `Demo ${key}`,
    installed: true,
    enabled: true,
    skills_dir: "<workspace>/skills",
    is_custom: false,
    has_path_override: false,
    project_relative_skills_dir: null,
    has_project_path_override: false,
  };
}

it("defaults to projects and exposes every project with its status and route", async () => {
  app.tools = [agent("codex", "coding"), agent("hermes", "lobster")];
  app.projects = Array.from({ length: 12 }, (_, i) => project(i));
  await render();
  const scopeButtons = container.querySelectorAll<HTMLButtonElement>(
    '[role="group"][aria-label="工作空间类型"] button',
  );
  expect(scopeButtons[0].getAttribute("aria-pressed")).toBe("true");
  expect(scopeButtons[0].textContent).toContain("项目工作空间");
  const entries = container.querySelector("#dashboard-workspace-entries")!;
  expect(entries.querySelectorAll("a")).toHaveLength(12);
  expect(entries.querySelector('a[href="/global-workspace/codex"]')).toBeNull();
  const last = entries.querySelector<HTMLAnchorElement>(
    'a[href="/project/project-11"]',
  )!;
  expect(last.textContent).toContain("11 个技能");
  expect(last.textContent).toContain("2 项内容冲突");
  await act(async () => last.click());
  expect(container.textContent).toBe("/project/project-11");
});

it("keeps the project empty state with enabled Agents and allows switching", async () => {
  app.tools = [agent("codex", "coding"), agent("hermes", "lobster")];
  await render();
  const entries = container.querySelector("#dashboard-workspace-entries")!;
  expect(entries.textContent).toContain("关联项目");
  expect(entries.querySelectorAll("a")).toHaveLength(0);
  const scopeButtons = container.querySelectorAll<HTMLButtonElement>(
    '[role="group"][aria-label="工作空间类型"] button',
  );
  await act(async () => scopeButtons[1].click());
  expect(
    entries.querySelector('a[href="/global-workspace/codex"]'),
  ).not.toBeNull();
  expect(
    entries.querySelector('a[href="/lobster-workspace/hermes"]'),
  ).not.toBeNull();
  expect(container.querySelector('a[href="/settings#agents"]')).not.toBeNull();
  app.projects = [project(0)];
  await render();
  expect(scopeButtons[1].getAttribute("aria-pressed")).toBe("true");
  expect(entries.querySelectorAll("a")).toHaveLength(2);
});

async function searchWorkspaces(value: string) {
  const input = container.querySelector<HTMLInputElement>(
    'input[type="search"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("filters workspace names, clears no matches and resets search on type switch", async () => {
  app.projects = Array.from({ length: 12 }, (_, i) => project(i));
  app.tools = [agent("codex", "coding")];
  await render();
  const entries = container.querySelector("#dashboard-workspace-entries")!;
  await searchWorkspaces("  DEMO-PROJECT-11 ");
  expect(entries.querySelectorAll("a")).toHaveLength(1);
  expect(entries.textContent).toContain("2 项内容冲突");
  await searchWorkspaces("missing");
  expect(entries.querySelectorAll("a")).toHaveLength(0);
  expect(entries.textContent).toContain("没有匹配的工作空间");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="清除工作空间搜索"]',
      )!
      .click(),
  );
  expect(entries.querySelectorAll("a")).toHaveLength(12);
  await searchWorkspaces("missing");
  await act(async () =>
    container
      .querySelectorAll<HTMLButtonElement>(
        '[role="group"][aria-label="工作空间类型"] button',
      )[1]
      .click(),
  );
  expect(
    entries.querySelector('a[href="/global-workspace/codex"]'),
  ).not.toBeNull();
  expect(container.querySelector('input[type="search"]')).toBeNull();
  await act(async () =>
    container
      .querySelectorAll<HTMLButtonElement>(
        '[role="group"][aria-label="工作空间类型"] button',
      )[0]
      .click(),
  );
  expect(entries.querySelectorAll("a")).toHaveLength(12);
});
