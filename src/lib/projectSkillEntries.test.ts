import { expect, it } from "vitest";
import {
  createProjectLibraryStatus,
  createProjectSkill,
  createTeamStatus,
} from "../../tests/fixtures/projectSkill";
import { groupProjectSkills } from "./projectSkillEntries";

it("associates team maintenance by directory rather than duplicate display names", () => {
  const team = createTeamStatus("managed");
  const groups = groupProjectSkills(
    [
      createProjectSkill({ name: "same", relative_path: "other" }),
      createProjectSkill({ name: "same", relative_path: "managed" }),
    ],
    createProjectLibraryStatus([team]),
  );
  expect(groups[0].relative_path).toBe("managed");
  expect(groups[0].teamStatus).toEqual(team);
  expect(groups[1].teamStatus).toBeUndefined();
});

it("puts skills needing updates or team refresh ahead of ordinary skills", () => {
  const groups = groupProjectSkills(
    [
      createProjectSkill({ name: "alpha", relative_path: "alpha" }),
      createProjectSkill({
        name: "local",
        relative_path: "local",
        sync_status: "project_only",
      }),
      createProjectSkill({ name: "z-refresh", relative_path: "refresh" }),
      createProjectSkill({
        name: "z-update",
        relative_path: "update",
        sync_status: "center_newer",
      }),
    ],
    createProjectLibraryStatus([createTeamStatus("refresh")]),
  );
  expect(groups.map((skill) => skill.relative_path)).toEqual([
    "update",
    "refresh",
    "local",
    "alpha",
  ]);
});

it("returns refreshed skills to their normal position and also prioritizes modified project contents", () => {
  const skills = [
    createProjectSkill({ name: "alpha", relative_path: "alpha" }),
    createProjectSkill({ name: "zulu", relative_path: "zulu" }),
  ];
  const team = createTeamStatus("zulu", false);
  expect(
    groupProjectSkills(
      skills,
      createProjectLibraryStatus([{ ...team, modified: true }]),
    ).map((skill) => skill.id),
  ).toEqual(["zulu", "alpha"]);
  expect(
    groupProjectSkills(skills, createProjectLibraryStatus([team])).map(
      (skill) => skill.id,
    ),
  ).toEqual(["alpha", "zulu"]);
});

it("preserves grouped agent variants, tags, files and sync priority without mutating the scan", () => {
  const first = createProjectSkill({
    files: ["SKILL.md"],
    tags: ["one"],
    description: null,
  });
  const second = createProjectSkill({
    agent: "codex",
    agent_display_name: "Codex",
    enabled: false,
    files: ["SKILL.md", "run.py"],
    tags: ["two"],
    sync_status: "diverged",
    center_skill_id: "other-id",
  });
  const [group] = groupProjectSkills([second, first], null);
  expect(group.status).toBe("diverged");
  expect(group.variants.map((skill) => skill.agent)).toEqual([
    "claude_code",
    "codex",
  ]);
  expect(group.enabledCount).toBe(1);
  expect(group.totalCount).toBe(2);
  expect(group.files).toEqual(["SKILL.md", "run.py"]);
  expect(group.tags).toEqual(["one", "two"]);
  expect(group.centerSkillIds).toEqual(["demo-id", "other-id"]);
  expect(first.tags).toEqual(["one"]);
});
