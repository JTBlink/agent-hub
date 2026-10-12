import { expect, it } from "vitest";
import { makeSkill } from "../../tests/fixtures/managedSkill";
import {
  filterSkillLibrary,
  skillLibraryDisplayNames,
  type SkillLibraryFilterState,
} from "./skillLibraryFilters";
import { UNTAGGED_FILTER } from "./skillTags";
import type { ManagedSkill } from "./tauri";

const defaults: SkillLibraryFilterState = {
  search: "",
  sources: new Set(),
  tags: new Set(),
  ungrouped: false,
  deployment: "all",
  membership: "all",
};
function filter(
  skills: ManagedSkill[],
  state: Partial<SkillLibraryFilterState> = {},
  groupId?: string,
  viewingUngrouped = false,
  order: string[] = [],
) {
  return filterSkillLibrary(
    skills,
    skillLibraryDisplayNames(skills),
    { ...defaults, ...state },
    groupId,
    viewingUngrouped,
    order,
  );
}

it("counts prospective deployment and group choices independently within other filters", () => {
  const skills = [
    makeSkill(1),
    makeSkill(2, true),
    { ...makeSkill(3), skill_group_ids: [] },
    { ...makeSkill(4, true), skill_group_ids: [] },
  ];
  const result = filter(
    skills,
    { membership: "enabled", deployment: "undeployed" },
    "demo-group",
  );
  expect(result.filtered.map((skill) => skill.id)).toEqual(["skill-1"]);
  expect(result.deploymentCounts).toEqual({
    all: 2,
    deployed: 1,
    undeployed: 1,
  });
  expect(result.membershipCounts).toEqual({ all: 2, enabled: 1, available: 1 });
  expect(
    filter(
      skills,
      { membership: "available", deployment: "undeployed" },
      "demo-group",
    ).filtered.map((skill) => skill.id),
  ).toEqual(["skill-3"]);
});

it("combines search, untagged and undeployed filters in the ungrouped view", () => {
  const skills = [
    {
      ...makeSkill(1),
      skill_group_ids: [],
      name: "demo-one",
      description: "export documents",
    },
    { ...makeSkill(2), skill_group_ids: [], name: "demo-two", tags: ["docs"] },
    { ...makeSkill(3, true), skill_group_ids: [], name: "demo-three" },
    { ...makeSkill(4), name: "demo-four" },
  ];
  expect(
    filter(
      skills,
      {
        deployment: "undeployed",
        tags: new Set([UNTAGGED_FILTER]),
        search: "demo",
      },
      undefined,
      true,
    ).filtered.map((skill) => skill.id),
  ).toEqual(["skill-1"]);
  expect(
    filter(skills, {
      deployment: "undeployed",
      search: "export documents",
    }).filtered.map((skill) => skill.id),
  ).toEqual(["skill-1"]);
});

it("preserves update priority and group ordering after deployment filtering", () => {
  const skills = [
    makeSkill(1),
    makeSkill(2),
    {
      ...makeSkill(3),
      source_type: "git",
      source_ref: "https://example.invalid/demo/skills",
      update_status: "update_available",
    },
    makeSkill(4, true),
  ];
  expect(
    filter(
      skills,
      { membership: "enabled", deployment: "undeployed" },
      "demo-group",
      false,
      ["skill-2", "skill-1"],
    ).filtered.map((skill) => skill.id),
  ).toEqual(["skill-3", "skill-2", "skill-1"]);
  expect(skills.map((skill) => skill.id)).toEqual([
    "skill-1",
    "skill-2",
    "skill-3",
    "skill-4",
  ]);
});

it("searches directory display names for skills sharing a name", () => {
  const skills = [
    {
      ...makeSkill(1),
      name: "demo",
      central_path: "<workspace>/library/demo-tool",
    },
    {
      ...makeSkill(2),
      name: "demo",
      central_path: "<workspace>/library/demo-docs",
    },
  ];
  expect(
    filter(skills, { search: "demo-tool" }).filtered.map((skill) => skill.id),
  ).toEqual(["skill-1"]);
});
