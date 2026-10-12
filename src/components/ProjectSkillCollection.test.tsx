// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import {
  createProjectLibraryStatus,
  createProjectSkill,
  createTeamStatus,
} from "../../tests/fixtures/projectSkill";
import { groupProjectSkills } from "../lib/projectSkillEntries";
import { ProjectSkillCollection } from "./ProjectSkillCollection";

const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
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
beforeEach(() => {
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
  "explains missing Agent files and offers to add them again in %s view",
  async (viewMode) => {
    const missing = createTeamStatus();
    missing.target_issues = [
      {
        agent: "codex",
        agent_name: "Codex",
        reason: "missing",
        path: ".codex/skills/demo",
      },
    ];
    missing.targets = ["codex"];
    missing.stale_targets = ["codex"];
    await render({
      viewMode,
      skills: groupProjectSkills(
        [createProjectSkill()],
        createProjectLibraryStatus([missing]),
      ),
    });
    expect(container.textContent).toContain("部分 Agent 找不到此技能");
    expect(container.textContent).toContain("项目里的技能内容仍然保留");
    expect(container.textContent).toContain(
      "Codex：未找到该 Agent 的技能文件，需要重新添加。",
    );
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="重新添加到 Agent"]',
    );
    expect(button).not.toBeNull();
    await act(async () => button?.click());
    expect(onRepair).toHaveBeenCalledExactlyOnceWith("demo");
    expect(onOpenDetail).not.toHaveBeenCalled();
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
