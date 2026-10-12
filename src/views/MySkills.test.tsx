// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ManagedSkill, SkillGroup } from "../lib/tauri";
import zh from "../i18n/zh.json";
import { MySkills } from "./MySkills";
import { Dashboard } from "./Dashboard";
import { makeSkill } from "../../tests/fixtures/managedSkill";
import { makeSkillGroup } from "../../tests/fixtures/skillGroup";

const app = vi.hoisted(() => ({
  managedSkills: [] as ManagedSkill[],
  viewedSkillGroup: null as SkillGroup | null,
  viewingUngrouped: false,
  skillGroups: [] as SkillGroup[],
  tools: [],
  projects: [],
  detailSkillId: null as string | null,
  refreshSkillGroups: vi.fn(),
  refreshSkillGroupMembership: vi.fn(),
  refreshManagedSkills: vi.fn(),
  refreshTools: vi.fn(),
  refreshProjects: vi.fn(),
  openSkillDetailById: vi.fn(),
  closeSkillDetail: vi.fn(),
  setViewedSkillGroupId: vi.fn(),
  setSkillGroupMembership: vi.fn(),
}));
vi.mock("../context/AppContext", () => ({ useApp: () => app }));
vi.mock("../components/AgentControlSetupCard", () => ({
  AgentControlSetupCard: () => null,
}));
vi.mock("../lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/tauri")>()),
  getAllTags: async () => [
    ...new Set(app.managedSkills.flatMap((skill) => skill.tags)),
  ],
  getSkillGroupSkillOrder: async () => [],
  gitBackupPendingConflicts: async () => [],
  getSettings: async () => null,
  gitBackupStatus: async () => null,
  setSkillGroupMembership: app.setSkillGroupMembership,
}));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  app.managedSkills = [makeSkill(1), makeSkill(2, true), makeSkill(3)];
  app.viewedSkillGroup = null;
  app.viewingUngrouped = false;
  app.skillGroups = [];
  app.setSkillGroupMembership.mockReset().mockResolvedValue([]);
  app.refreshManagedSkills.mockReset();
  app.setViewedSkillGroupId.mockImplementation(() => {
    app.viewedSkillGroup = null;
    app.viewingUngrouped = false;
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

function LocationControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-location>
        {location.pathname}
        {location.search}
      </output>
      <button onClick={() => navigate(-1)}>Back</button>
    </>
  );
}

async function render(route = "/my-skills") {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[route]}>
        <LocationControls />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/my-skills" element={<MySkills />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

function row(label: string) {
  return container.querySelector(`[role="group"][aria-label="${label}"]`)!;
}
function button(parent: Element, label: string) {
  const match = [...parent.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.startsWith(label),
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}
async function click(parent: Element, label: string) {
  await act(async () => button(parent, label).click());
}

it.each(["grid", "list"])(
  "assigns an ungrouped skill from the %s view and refreshes membership",
  async (view) => {
    app.viewingUngrouped = true;
    app.managedSkills = [{ ...makeSkill(1), skill_group_ids: [] }];
    app.skillGroups = [makeSkillGroup("dev", "dev-tools")];
    app.refreshManagedSkills.mockImplementation(async () => {
      app.managedSkills = [
        { ...app.managedSkills[0], skill_group_ids: ["dev"] },
      ];
    });
    await render();
    if (view === "list") {
      const listButton = container
        .querySelector("svg.lucide-list")
        ?.closest("button");
      expect(listButton).not.toBeNull();
      await act(async () => listButton?.click());
    }
    await click(container, "加入技能组");
    expect(app.openSkillDetailById).not.toHaveBeenCalled();
    const menu = document.querySelector('[role="menu"]')!;
    await click(menu, "dev-tools");
    expect(app.setSkillGroupMembership).toHaveBeenCalledExactlyOnceWith(
      ["skill-1"],
      "dev",
      true,
    );
    expect(app.refreshSkillGroupMembership).toHaveBeenCalledWith("dev");
    expect(app.refreshManagedSkills).toHaveBeenCalled();
    await render();
    expect(container.textContent).not.toContain("demo-skill-1");
  },
);

it("shows the full undeployed library from the dashboard after clearing the previous group", async () => {
  app.viewedSkillGroup = {
    id: "old-group",
    name: "Demo",
    description: null,
    icon: null,
    sort_order: 0,
    skill_count: 0,
    created_at: 1,
    updated_at: 1,
  };
  app.viewingUngrouped = true;
  app.managedSkills = [
    makeSkill(0, true),
    ...Array.from({ length: 14 }, (_, i) => makeSkill(i + 1)),
  ];
  await render("/");
  await click(
    container.querySelector('section[aria-label="技能与部署概览"]')!,
    "未部署",
  );
  expect(container.querySelector("[data-location]")!.textContent).toBe(
    "/my-skills?deployment=undeployed",
  );
  expect(container.querySelector('[role="status"]')!.textContent).toBe(
    "显示 14 个技能",
  );
  expect(button(row("部署状态"), "未部署").getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect(container.querySelector("dialog")).toBeNull();
  expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
  expect(button(container, "更多筛选").textContent).toContain("1");
  await click(container, "Back");
  expect(container.querySelector("[data-location]")!.textContent).toBe("/");
});

it("combines deployment, source and tags and restores the list when filters are cleared", async () => {
  app.managedSkills[0] = { ...makeSkill(1), source_type: "git", tags: ["dev"] };
  app.managedSkills[1] = {
    ...makeSkill(2, true),
    source_type: "git",
    tags: ["dev"],
  };
  app.managedSkills[2] = { ...makeSkill(3), tags: ["docs"] };
  await render();
  await click(container, "更多筛选");
  await click(row("部署状态"), "未部署");
  await click(row("来源"), "Git");
  await click(row("标签"), "dev");
  expect(container.querySelector('[role="status"]')!.textContent).toBe(
    "显示 1 个技能",
  );
  expect(button(row("部署状态"), "全部").textContent).toContain("2");
  expect(button(row("部署状态"), "已部署").textContent).toContain("1");
  expect(button(row("部署状态"), "未部署").textContent).toContain("1");
  await click(container, "清除筛选");
  expect(container.querySelector('[role="status"]')!.textContent).toBe(
    "显示 3 个技能",
  );
  expect(container.querySelector("[data-location]")!.textContent).toBe(
    "/my-skills",
  );
});

it("updates an active undeployed filter when a skill is deployed and keeps a way out of zero results", async () => {
  app.managedSkills = [makeSkill(1)];
  await render("/my-skills?deployment=undeployed");
  app.managedSkills = [makeSkill(1, true)];
  await render();
  expect(container.querySelector('[role="status"]')!.textContent).toBe(
    "显示 0 个技能",
  );
  expect(container.textContent).toContain("没有符合当前搜索或筛选条件");
  expect(button(row("部署状态"), "未部署").getAttribute("aria-pressed")).toBe(
    "true",
  );
  await click(container, "更多筛选");
  await click(row("部署状态"), "全部");
  expect(container.querySelector('[role="status"]')!.textContent).toBe(
    "显示 1 个技能",
  );
});

it("expands tags in place and keeps selected overflow tags visible after collapse", async () => {
  app.managedSkills = [
    {
      ...makeSkill(1),
      tags: Array.from({ length: 10 }, (_, index) => `tag-${index}`),
    },
  ];
  await render();
  await click(container, "更多筛选");
  const tags = row("标签");
  expect(tags.textContent).not.toContain("tag-9");
  await click(tags, "展开其余");
  await click(tags, "tag-9");
  await click(tags, "收起标签");
  expect(button(tags, "tag-9").getAttribute("aria-pressed")).toBe("true");
  expect(button(tags, "展开其余").getAttribute("aria-expanded")).toBe("false");
});

it("starts with one filter row and preserves active secondary filters while collapsed", async () => {
  app.managedSkills[0] = { ...makeSkill(1), source_type: "git" };
  await render();
  const expand = button(container, "更多筛选");
  const controlsId = expand.getAttribute("aria-controls")!;
  const secondary = document.getElementById(controlsId)!;
  expect(secondary.hidden).toBe(true);
  expect(secondary.contains(row("部署状态"))).toBe(true);
  expect(secondary.contains(row("技能组"))).toBe(false);
  expect(expand.getAttribute("aria-expanded")).toBe("false");
  await click(container, "更多筛选");
  expect(secondary.hidden).toBe(false);
  await click(row("来源"), "Git");
  await click(container, "收起筛选");
  expect(secondary.hidden).toBe(true);
  expect(button(container, "更多筛选").textContent).toContain("1");
  expect(container.querySelector('[role="status"]')!.textContent).toBe(
    "显示 1 个技能",
  );
  await click(container, "清除筛选");
  expect(secondary.hidden).toBe(true);
  expect(button(container, "更多筛选").textContent).not.toContain("1");
  expect(container.querySelector('[role="status"]')!.textContent).toBe(
    "显示 3 个技能",
  );
});

it("removes hidden bulk selections when deployment filtering changes", async () => {
  await render();
  await click(container, "多选");
  await click(container, "全选");
  expect(container.textContent).toContain("已选 3");
  await click(container, "更多筛选");
  await click(row("部署状态"), "未部署");
  expect(container.textContent).toContain("已选 2");
  expect(container.textContent).not.toContain("已选 3");
});
