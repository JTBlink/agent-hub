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

it("opens the full library undeployed filter without a dialog or a stale group", async () => {
  app.managedSkills = [
    makeSkill(0, true),
    ...Array.from({ length: 14 }, (_, i) => makeSkill(i + 1)),
  ];
  await render();
  const overview = container.querySelector(
    'section[aria-label="技能与部署概览"]',
  )!;
  expect(overview.textContent).toContain("1/15");
  const button = overview.querySelector<HTMLButtonElement>("button")!;
  expect(button.textContent).toContain("未部署 14");
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
  expect(
    container.querySelector('section[aria-label="技能与部署概览"] button')!
      .textContent,
  ).toContain("未部署 2");
  app.managedSkills = [makeSkill(1, true), makeSkill(2)];
  await render();
  expect(
    container.querySelector('section[aria-label="技能与部署概览"] button')!
      .textContent,
  ).toContain("未部署 1");
  expect(container.querySelector("dialog")).toBeNull();
});

it.each([{ skills: [] }, { skills: [makeSkill(1, true)] }])(
  "disables the library entry when no skills are undeployed",
  async ({ skills }) => {
    app.managedSkills = skills;
    await render();
    const button = container.querySelector<HTMLButtonElement>(
      'section[aria-label="技能与部署概览"] button',
    )!;
    expect(button.textContent).toContain("未部署 0");
    expect(button.disabled).toBe(true);
    expect(container.querySelector("dialog")).toBeNull();
  },
);
