import { describe, expect, it } from "vitest";
import { matchesSkillSearch } from "./skillSearch";

describe("skill library search", () => {
  it("finds a skill by its exact name or description", () => {
    expect(
      matchesSkillSearch(
        "manage-skills",
        "manage-skills",
        "Agent control",
        "manage",
      ),
    ).toBe(true);
    expect(
      matchesSkillSearch(
        "manage-skills",
        "manage-skills",
        "Agent control",
        "control",
      ),
    ).toBe(true);
  });

  it("finds manage-skills when the query omits one letter", () => {
    expect(
      matchesSkillSearch("manage-skills", "manage-skills", null, "mange"),
    ).toBe(true);
    expect(
      matchesSkillSearch(
        "manage-skills",
        "manage-skills",
        null,
        "mange-skills",
      ),
    ).toBe(true);
  });

  it("does not return unrelated names or fuzzy match very short queries", () => {
    expect(
      matchesSkillSearch("manage-skills", "manage-skills", null, "backup"),
    ).toBe(false);
    expect(
      matchesSkillSearch("manage-skills", "manage-skills", null, "mge"),
    ).toBe(false);
  });
});
