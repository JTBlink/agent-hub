// @vitest-environment jsdom
import { act } from "react";
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
import { Sidebar } from "./Sidebar";

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
}));
vi.mock("../context/AppContext", () => ({ useApp: () => app }));
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
  await i18n.changeLanguage("zh");
  app.skillGroups = [];
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

it("provides a permanent automation entry independent of installed agents", async () => {
  await render();
  const link = container.querySelector<HTMLAnchorElement>(
    'a[href="/automation"]',
  )!;
  expect(link.textContent).toBe("自动化");
  await click(link);
  expect(container.querySelector("output")?.textContent).toBe("/automation");
});
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

function groups(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...makeSkillGroup(`group-${i}`, `Group ${i}`),
    skill_count: i + 1,
  }));
}
function more() {
  return container.querySelector<HTMLButtonElement>(
    "button[aria-controls][aria-expanded]",
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
  "shows five common groups with More only when needed (%i groups)",
  async (count) => {
    app.skillGroups = groups(count);
    await render("/my-skills");
    expect(groupOrder()).toEqual(
      app.skillGroups.slice(0, 5).map((group) => group.id),
    );
    expect(Boolean(more())).toBe(count > 5);
    if (count > 5) expect(more().textContent).toBe(`更多...${count}`);
  },
);

it.each(["zh", "en", "zh-TW"])(
  "expands the same sidebar list and collapses it with focus preserved in %s",
  async (language) => {
    await i18n.changeLanguage(language);
    app.skillGroups = groups(8);
    await render("/my-skills");
    const trigger = more();
    expect(trigger.textContent).toBe(`${i18n.t("sidebar.moreGroups")}8`);
    trigger.focus();
    await click(trigger);
    expect(groupOrder()).toEqual(app.skillGroups.map((group) => group.id));
    expect(container.querySelector('[role="dialog"], dialog')).toBeNull();
    expect(more()).toBe(trigger);
    expect(more().getAttribute("aria-expanded")).toBe("true");
    expect(
      document
        .getElementById(more().getAttribute("aria-controls")!)
        ?.getAttribute("data-rfd-droppable-id"),
    ).toBe("skillGroups");
    expect(more().textContent).toBe(`${i18n.t("sidebar.lessGroups")}8`);
    expect(document.activeElement).toBe(trigger);
    await click(trigger);
    expect(groupOrder()).toEqual(
      app.skillGroups.slice(0, 5).map((group) => group.id),
    );
    expect(more().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  },
);

it("keeps the selected extra group visible when collapsed without duplicating or reordering it", async () => {
  app.skillGroups = groups(8);
  app.viewedSkillGroup = app.skillGroups[7];
  await render("/my-skills");
  expect(button("Group 78").getAttribute("aria-current")).toBe("page");
  expect(groupOrder()).toEqual(groups(5).map((group) => group.id));
  await click(more());
  expect(groupOrder()).toEqual(app.skillGroups.map((group) => group.id));
  expect(
    [...container.querySelectorAll("button")].filter(
      (item) => item.textContent === "Group 78",
    ),
  ).toHaveLength(1);
  await click(more());
  expect(button("Group 78").getAttribute("aria-current")).toBe("page");
  app.viewedSkillGroup = null;
  await render("/my-skills");
  expect(container.textContent).not.toContain("Group 7");
});

it("switches to an expanded group without navigating on More or changing common order", async () => {
  app.skillGroups = groups(8);
  await render("/settings");
  await click(button("技能库0"));
  await click(more());
  expect(container.querySelector("output")?.textContent).toBe("/settings");
  expect(app.setViewedSkillGroupId).not.toHaveBeenCalled();
  await click(button("Group 78"));
  expect(app.setViewedSkillGroupId).toHaveBeenCalledWith("group-7");
  expect(app.setViewingUngrouped).toHaveBeenCalledWith(false);
  expect(app.closeSkillDetail).toHaveBeenCalledOnce();
  expect(container.querySelector("output")?.textContent).toBe("/my-skills");
  expect(more().getAttribute("aria-expanded")).toBe("true");
  await click(more());
  expect(groupOrder()).toEqual(groups(5).map((group) => group.id));
});

it("updates expanded rows and removes More when the group count falls to five", async () => {
  app.skillGroups = groups(8);
  await render("/my-skills");
  await click(more());
  app.skillGroups = app.skillGroups.slice(0, 5);
  await render("/my-skills");
  expect(groupOrder()).toEqual(app.skillGroups.map((group) => group.id));
  expect(more()).toBeNull();
  expect(container.textContent).not.toContain("Group 7");
});

it.each(["edit", "delete", "create"])(
  "keeps %s available after expanding the sidebar",
  async (action) => {
    app.skillGroups = groups(8);
    await render("/my-skills");
    await click(more());
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
