import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { beforeAll, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import en from "../i18n/en.json";
import { ProjectSkillUploadTarget } from "./ProjectSkillUploadTarget";

const i18n = createInstance();
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: i18n.t }) }));
beforeAll(async () => {
  await i18n.init({
    lng: "zh",
    resources: { zh: { translation: zh }, en: { translation: en } },
  });
});
const skills = [
  { id: "a", name: "central-skill", skill_group_ids: ["tools"] },
  { id: "b", name: "other-skill", skill_group_ids: ["default"] },
  { id: "c", name: "ungrouped-skill", skill_group_ids: [] },
];
const groups = [
  { id: "tools", name: "工具组" },
  { id: "default", name: "Default" },
];
function render(center_skill_id: string | null, skillGroups = groups) {
  return renderToStaticMarkup(
    createElement(ProjectSkillUploadTarget, {
      variant: { center_skill_id, name: "project-skill" },
      managedSkills: skills,
      skillGroups,
    }),
  );
}

it("shows the matched central skill and its group and explains membership is retained", () => {
  const html = render("a");
  expect(html).toContain("目标技能组");
  expect(html).toContain("central-skill");
  expect(html).toContain("工具组");
  expect(html).toContain("更新已有技能，保留当前技能组。");
});
it("updates the destination when another source variant is selected", () => {
  expect(render("a")).toContain("工具组");
  const html = render("b");
  expect(html).toContain("other-skill");
  expect(html).toContain("默认");
  expect(html).not.toContain("工具组");
});
it("distinguishes a new ungrouped skill from updating an existing ungrouped skill", () => {
  const newSkill = render(null);
  expect(newSkill).toContain("project-skill");
  expect(newSkill).toContain("新建技能，保存到未分组。");
  const existing = render("c");
  expect(existing).toContain("未分组");
  expect(existing).toContain("更新已有技能，保留当前技能组。");
});
it("does not claim ungrouped when destination data is missing", () => {
  expect(render("missing")).toContain("技能组信息暂不可用");
  expect(render("a", [])).toContain("技能组信息暂不可用");
  expect(render("a", [])).not.toContain("保存到未分组");
});
it("uses the current language for the default group", async () => {
  await i18n.changeLanguage("en");
  expect(render("b")).toContain("Default");
  expect(render("b")).toContain("Target skill group");
  await i18n.changeLanguage("zh");
});

it("shows the current group in the themed picker", () => {
  const html = renderToStaticMarkup(
    createElement(ProjectSkillUploadTarget, {
      variant: { center_skill_id: "a", name: "project-skill" },
      managedSkills: skills,
      skillGroups: groups,
      onSelectGroup: vi.fn(),
    }),
  );
  expect(html).toContain('role="combobox"');
  expect(html).toContain('aria-label="目标技能组"');
  expect(html).toContain('title="工具组"');
  expect(html).not.toContain("<select");
});
it("shows the user's selected destination instead of the original group", () => {
  const html = renderToStaticMarkup(
    createElement(ProjectSkillUploadTarget, {
      variant: { center_skill_id: "a", name: "project-skill" },
      managedSkills: skills,
      skillGroups: groups,
      selectedGroup: "default",
      onSelectGroup: vi.fn(),
    }),
  );
  expect(html).toContain('title="默认"');
  expect(html).toContain("已有技能会移入该组");
});
