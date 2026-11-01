// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import en from "../i18n/en.json";
import zhTW from "../i18n/zh-TW.json";
import { makeProject } from "../../tests/fixtures/workspace";
import { makeSkillGroup } from "../../tests/fixtures/skillGroup";
import { makeSkill } from "../../tests/fixtures/managedSkill";
import { CommandPalette } from "./CommandPalette";

const app = vi.hoisted(() => ({
  projects: [] as ReturnType<typeof makeProject>[],
  skillGroups: [] as ReturnType<typeof makeSkillGroup>[],
  managedSkills: [] as ReturnType<typeof makeSkill>[],
  viewedSkillGroup: null,
  setViewedSkillGroupId: vi.fn(),
  openSkillDetailById: vi.fn(),
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
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  await i18n.changeLanguage("zh");
  app.projects = [
    { ...makeProject(), id: "first", name: "Shared Z", sort_order: 0 },
    { ...makeProject(), id: "second", name: "Shared A", sort_order: 1 },
  ];
  app.skillGroups = [makeSkillGroup("group", "Shared group")];
  app.managedSkills = [{ ...makeSkill(1), name: "shared-skill" }];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function Shell() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <CommandPalette open={open} onOpenChange={setOpen} />
      <output>{useLocation().pathname}</output>
    </>
  );
}
async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <Shell />
      </MemoryRouter>,
    ),
  );
}
function options() {
  return [...container.querySelectorAll<HTMLElement>('[role="option"]')];
}
async function key(key: string) {
  await act(async () =>
    container
      .querySelector("input")!
      .dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })),
  );
}
async function query(value: string) {
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it.each(["zh", "en", "zh-TW"])(
  "lists projects first in sidebar order in %s",
  async (language) => {
    await i18n.changeLanguage(language);
    await render();
    const headings = [
      ...container.querySelectorAll('[role="listbox"] > div > div:first-child'),
    ].map((item) => item.textContent);
    expect(headings).toEqual([
      `${i18n.t("commandPalette.projects")} · 2`,
      `${i18n.t("commandPalette.skillGroups")} · 1`,
      `${i18n.t("commandPalette.skills")} · 1`,
      `${i18n.t("commandPalette.actions")} · 6`,
    ]);
    expect(
      options()
        .slice(0, 4)
        .map((item) => item.textContent),
    ).toEqual([
      "Shared Z<workspace>/demo",
      "Shared A<workspace>/demo",
      "Shared group0 skills",
      "shared-skillDescription 1",
    ]);
    expect(options()[0].getAttribute("aria-selected")).toBe("true");
  },
);

it("opens the first project on Enter", async () => {
  await render();
  await key("Enter");
  expect(container.querySelector("output")?.textContent).toBe("/project/first");
  expect(app.openSkillDetailById).not.toHaveBeenCalled();
});

it("keeps arrow selection and execution aligned across the project/group boundary", async () => {
  await render();
  await key("ArrowDown");
  await key("ArrowDown");
  expect(options()[2].getAttribute("aria-selected")).toBe("true");
  await key("Enter");
  expect(app.setViewedSkillGroupId).toHaveBeenCalledWith("group");
  expect(app.openSkillDetailById).not.toHaveBeenCalled();
  expect(container.querySelector("output")?.textContent).toBe("/my-skills");
});

it("keeps matching projects first and resets search selection to the first result", async () => {
  await render();
  await key("ArrowDown");
  await query("shared");
  expect(options()).toHaveLength(4);
  expect(options()[0].textContent).toContain("Shared Z");
  expect(options()[0].getAttribute("aria-selected")).toBe("true");
  await query("Shared A");
  await key("Enter");
  expect(container.querySelector("output")?.textContent).toBe(
    "/project/second",
  );
});

it("skips empty project/group sections while keeping skill navigation functional", async () => {
  app.projects = [];
  app.skillGroups = [];
  await render();
  expect(options()[0].textContent).toContain("shared-skill");
  await key("Enter");
  expect(app.openSkillDetailById).toHaveBeenCalledWith("skill-1");
  expect(container.querySelector("output")?.textContent).toBe("/my-skills");
});
