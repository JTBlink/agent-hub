// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import type { ManagedSkill } from "../lib/tauri";
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
}));
vi.mock("../context/AppContext", () => ({
  useApp: () => ({ ...app, tools: [], projects: [] }),
}));
vi.mock("../components/AgentControlSetupCard", () => ({
  AgentControlSetupCard: () => null,
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
  app.managedSkills = [];
  app.loading = false;
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

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/my-skills" element={<LibraryDestination />} />
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
  expect(app.setViewingUngrouped).toHaveBeenCalledWith(true);
  expect(app.closeSkillDetail).toHaveBeenCalledOnce();
  expect(container.textContent).toBe("Skill library");
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
  expect(app.setViewingUngrouped).not.toHaveBeenCalled();
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
