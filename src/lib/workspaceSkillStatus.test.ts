import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import zh from "../i18n/zh.json";
import en from "../i18n/en.json";
import {
  getLocalStatusMeta,
  getWorkspaceSkillCardStatus,
} from "./workspaceSkillStatus";
import type { ProjectSkill } from "./tauri";

const i18n = createInstance();
await i18n.init({
  lng: "zh",
  resources: { zh: { translation: zh }, en: { translation: en } },
});
const managedSkills = new Map([
  ["skill", { skill_group_ids: ["group"] }],
  ["ungrouped", { skill_group_ids: [] }],
  ["missing-group", { skill_group_ids: ["missing"] }],
]);
const groups = new Map([["group", { name: "消息工具" }]]);
const skill = { sync_status: "in_sync" as const, center_skill_id: "skill" };

describe("workspace skill card status", () => {
  it("replaces the healthy sync label with the matched central skill's group", () => {
    expect(
      getWorkspaceSkillCardStatus(i18n.t, skill, managedSkills, groups).label,
    ).toBe("消息工具");
  });

  it("shows ungrouped for a central skill without membership", () => {
    expect(
      getWorkspaceSkillCardStatus(
        i18n.t,
        { ...skill, center_skill_id: "ungrouped" },
        managedSkills,
        groups,
      ).label,
    ).toBe("未分组");
  });

  it("keeps actionable sync states even when the skill belongs to a group", () => {
    for (const status of [
      "project_only",
      "project_newer",
      "center_newer",
      "diverged",
    ] satisfies ProjectSkill["sync_status"][]) {
      expect(
        getWorkspaceSkillCardStatus(
          i18n.t,
          { ...skill, sync_status: status },
          managedSkills,
          groups,
        ),
      ).toEqual(getLocalStatusMeta(i18n.t, status));
    }
  });

  it("retains the sync label while central skill or group data is unavailable", () => {
    for (const id of [null, "unknown", "missing-group"]) {
      expect(
        getWorkspaceSkillCardStatus(
          i18n.t,
          { ...skill, center_skill_id: id },
          managedSkills,
          groups,
        ).label,
      ).toBe(i18n.t("globalWorkspace.localSkills.status.inSync"));
    }
  });

  it("localizes the default group after changing language", async () => {
    const defaults = new Map([["group", { name: "Default" }]]);
    expect(
      getWorkspaceSkillCardStatus(i18n.t, skill, managedSkills, defaults).label,
    ).toBe("默认");
    await i18n.changeLanguage("en");
    expect(
      getWorkspaceSkillCardStatus(i18n.t, skill, managedSkills, defaults).label,
    ).toBe("Default");
    await i18n.changeLanguage("zh");
  });
});
