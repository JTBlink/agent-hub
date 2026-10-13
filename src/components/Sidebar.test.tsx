// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import type { SkillGroup } from "../lib/tauri";
import { makeTool, makeProject } from "../../tests/fixtures/workspace";
import { Sidebar } from "./Sidebar";

const app = vi.hoisted(() => ({
  skillGroups: [],
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
}));
vi.mock("../context/AppContext", () => ({ useApp: () => app }));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  app.viewedSkillGroup = null;
  app.viewingUngrouped = false;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
    </>
  );
}

async function render(path = "/global-workspace/codex") {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
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
function expanded() {
  return [...container.querySelectorAll('[aria-expanded="true"]')].map(
    (element) => element.textContent,
  );
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
  expect(expanded()).toEqual(["全局工作区"]);
});

it("opens only the active region on navigation, including history return after a manual toggle", async () => {
  await render("/lobster-workspace/hermes");
  expect(expanded()).toEqual(["全局工作区"]);
  await click(button("项目工作区"));
  expect(expanded()).toEqual(["项目工作区"]);
  await click(button("Go settings"));
  expect(expanded()).toEqual([]);
  await click(button("Go back"));
  expect(expanded()).toEqual(["全局工作区"]);
  await click(button("Go project"));
  expect(expanded()).toEqual(["项目工作区"]);
  await click(button("项目工作区"));
  expect(expanded()).toEqual([]);
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
  const heading = container.querySelector<HTMLButtonElement>(
    "button[aria-expanded]",
  )!;
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
