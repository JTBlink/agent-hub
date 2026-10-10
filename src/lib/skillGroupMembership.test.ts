import { describe, expect, it, vi } from "vitest";
import {
  skillLibraryContentKey,
  withSkillGroupMembership,
} from "./skillGroupMembership";
import { setSkillGroupMembership } from "./tauri";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

const skills = [
  { id: "a", skill_group_ids: ["other"], updated_at: 1, tags: ["dev"] },
  { id: "b", skill_group_ids: ["edited"], updated_at: 1, tags: [] },
  { id: "c", skill_group_ids: [], updated_at: 1, tags: [] },
];

describe("skill group membership refresh", () => {
  it("replaces group membership exclusively when adding", () => {
    const next = withSkillGroupMembership(skills, "edited", ["a"]);
    expect(next[0].skill_group_ids).toEqual(["edited"]);
    expect(next[1].skill_group_ids).toEqual([]);
    expect(next[2]).toBe(skills[2]);
    expect(next[0].tags).toBe(skills[0].tags);
    expect(withSkillGroupMembership(next, "edited", ["a"])).toBe(next);
  });

  it("does not restart the backup scan for group-only changes", () => {
    const key = skillLibraryContentKey(skills);
    expect(
      skillLibraryContentKey(withSkillGroupMembership(skills, "edited", ["a"])),
    ).toBe(key);
    expect(
      skillLibraryContentKey(
        skills.map((skill) => ({ ...skill, updated_at: 2 })),
      ),
    ).not.toBe(key);
    expect(
      skillLibraryContentKey(
        skills.map((skill) => ({ ...skill, tags: ["new"] })),
      ),
    ).not.toBe(key);
    expect(skillLibraryContentKey(skills.slice(1))).not.toBe(key);
  });

  it("submits a multi-skill change in a single command", async () => {
    vi.mocked(invoke).mockClear();
    await setSkillGroupMembership(["a", "b", "c"], "edited", true);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("set_skill_group_membership", {
      skillIds: ["a", "b", "c"],
      skillGroupId: "edited",
      add: true,
    });
  });
});
