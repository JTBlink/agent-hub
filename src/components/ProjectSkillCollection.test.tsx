// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import en from "../i18n/en.json";
import zhTW from "../i18n/zh-TW.json";
import {
  createProjectLibraryStatus,
  createProjectSkill,
  createTeamStatus,
} from "../../tests/fixtures/projectSkill";
import { groupProjectSkills } from "../lib/projectSkillEntries";
import { ProjectSkillCollection } from "./ProjectSkillCollection";

const i18n = createInstance();
await i18n.init({
  lng: "zh",
  resources: {
    zh: { translation: zh },
    en: { translation: en },
    "zh-TW": { translation: zhTW },
  },
});
const t = i18n.t.bind(i18n);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
let container: HTMLDivElement;
let root: Root;
const onRepair = vi.fn().mockResolvedValue(undefined);
const onOpenDetail = vi.fn();
const onSelect = vi.fn();
const onUpdateProject = vi.fn().mockResolvedValue(undefined);
const onDelete = vi.fn();
const skills = groupProjectSkills(
  [
    createProjectSkill({ name: "alpha", relative_path: "alpha" }),
    createProjectSkill({ name: "z-demo" }),
  ],
  createProjectLibraryStatus([createTeamStatus()]),
);
beforeEach(async () => {
  await i18n.changeLanguage("zh");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(
  overrides: Partial<ComponentProps<typeof ProjectSkillCollection>> = {},
) {
  await act(async () =>
    root.render(
      <ProjectSkillCollection
        skills={skills}
        viewMode="grid"
        isMultiSelect={false}
        selectedIds={new Set()}
        updatingCenterSkill={null}
        updatingProjectSkill={null}
        togglingSkill={null}
        togglingAgentTarget={null}
        repairingDirectory={null}
        allTags={[]}
        skillGroupsForEntry={new Map()}
        activeGroupId={null}
        targets={[]}
        supportsToggle={false}
        onSelect={onSelect}
        onOpenDetail={onOpenDetail}
        onUpdateCenter={async () => {}}
        onUpdateProject={onUpdateProject}
        onGroupClick={() => {}}
        onToggleAgent={async () => {}}
        onToggleSkill={async () => {}}
        onDelete={onDelete}
        onRepair={onRepair}
        {...overrides}
      />,
    ),
  );
}
it.each(["grid", "list"] as const)(
  "does not offer Agent restoration for a changed record with current entries in %s view",
  async (viewMode) => {
    const current = { ...createTeamStatus("demo", false), modified: true };
    for (const [locale, label] of [
      ["zh", "与个人技能库一致"],
      ["en", "Matches personal library"],
      ["zh-TW", "與個人技能庫一致"],
    ]) {
      await i18n.changeLanguage(locale);
      await render({
        viewMode,
        skills: groupProjectSkills(
          [createProjectSkill()],
          createProjectLibraryStatus([current]),
        ),
      });
      expect(container.textContent).toContain(label);
      expect(container.textContent).not.toContain(t("projectLibrary.modified"));
      expect(container.textContent).not.toContain(
        t("projectLibrary.modifiedHelp"),
      );
      expect(
        container.querySelector(
          `button[aria-label="${t("projectLibrary.repair")}"]`,
        ),
      ).toBeNull();
    }
    expect(onRepair).not.toHaveBeenCalled();
  },
);
it.each(["grid", "list"] as const)(
  "still restores actual Agent issues when project content has changed in %s view",
  async (viewMode) => {
    await render({
      viewMode,
      skills: groupProjectSkills(
        [createProjectSkill()],
        createProjectLibraryStatus([{ ...createTeamStatus(), modified: true }]),
      ),
    });
    expect(container.textContent).toContain("部分 Agent 的技能文件需要处理");
    expect(container.textContent).toContain("相对上次管理记录有变更");
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="恢复 Agent 技能"]',
    );
    expect(button).not.toBeNull();
    await act(async () => button?.click());
    expect(onRepair).toHaveBeenCalledExactlyOnceWith("demo");
    expect(onOpenDetail).not.toHaveBeenCalled();
  },
);
it.each(["grid", "list"] as const)(
  "shows refresh on the matching skill in %s view without opening details",
  async (viewMode) => {
    await render({ viewMode });
    const cards = [
      ...container.querySelectorAll<HTMLElement>("[data-skill-directory]"),
    ];
    expect(cards.map((card) => card.dataset.skillDirectory)).toEqual([
      "demo",
      "alpha",
    ]);
    expect(cards[0].textContent).toContain("部分 Agent 的技能文件需要处理");
    expect(cards[1].textContent).not.toContain("部分 Agent 的技能文件需要处理");
    const button = cards[0].querySelector<HTMLButtonElement>(
      'button[aria-label="恢复 Agent 技能"]',
    );
    expect(button).not.toBeNull();
    await act(async () => button?.click());
    expect(onRepair).toHaveBeenCalledExactlyOnceWith("demo");
    expect(onOpenDetail).not.toHaveBeenCalled();
    await act(async () => cards[1].click());
    expect(onOpenDetail).toHaveBeenCalledWith(skills[1]);
  },
);
it("disables team refresh while an operation is pending and keeps its skill status visible", async () => {
  await render({ repairingDirectory: "demo" });
  expect(
    container.querySelector<HTMLButtonElement>(
      'button[aria-label="恢复 Agent 技能"]',
    )?.disabled,
  ).toBe(true);
  expect(container.textContent).toContain("部分 Agent 的技能文件需要处理");
});
it.each(["grid", "list"] as const)(
  "keeps an unassigned Agent grey without a repair prompt in %s view",
  async (viewMode) => {
    const unassigned = createTeamStatus("demo", false);
    unassigned.targets = ["codex"];
    unassigned.target_issues = [];
    await render({
      viewMode,
      skills: groupProjectSkills(
        [createProjectSkill({ agent: "cline", agent_display_name: "Cline" })],
        createProjectLibraryStatus([unassigned]),
      ),
      targets: [
        {
          key: "codex",
          display_name: "Codex",
          installed: true,
          enabled: true,
          is_custom: false,
        },
      ],
    });
    expect(container.textContent).not.toContain("部分 Agent");
    expect(container.textContent).not.toContain("重新添加");
    expect(
      container.querySelector('button[aria-label="恢复 Agent 技能"]'),
    ).toBeNull();
    expect(
      container.querySelector('button[title*="Codex · available"]'),
    ).not.toBeNull();
    expect(onRepair).not.toHaveBeenCalled();
  },
);
it("keeps skill maintenance out of multi-selection controls", async () => {
  await render({ isMultiSelect: true });
  expect(
    container.querySelector('button[aria-label="恢复 Agent 技能"]'),
  ).toBeNull();
  await act(async () =>
    container
      .querySelector<HTMLElement>('[data-skill-directory="demo"]')
      ?.click(),
  );
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("demo");
  expect(onRepair).not.toHaveBeenCalled();
});
it.each(["grid", "list"] as const)(
  "preserves update and delete actions in %s view without opening details",
  async (viewMode) => {
    const updateSkills = groupProjectSkills(
      [createProjectSkill({ sync_status: "center_newer" })],
      null,
    );
    await render({ viewMode, skills: updateSkills });
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          `button[aria-label="${t("project.updateProject")}"]`,
        )
        ?.click(),
    );
    expect(onUpdateProject).toHaveBeenCalledWith(updateSkills[0]);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          `button[title="${t("project.deleteSkill")}"]`,
        )
        ?.click(),
    );
    expect(onDelete).toHaveBeenCalledWith(updateSkills[0]);
    expect(onOpenDetail).not.toHaveBeenCalled();
  },
);
