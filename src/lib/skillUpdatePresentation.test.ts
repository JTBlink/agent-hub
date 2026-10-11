import { expect, it } from "vitest";
import { canRefreshSkill, skillUpdateBadge } from "./skillUpdatePresentation";
it("does not report missing import provenance as a skill error", () => {
  expect(
    skillUpdateBadge({ update_status: "source_missing" }, (key) => key),
  ).toBeNull();
});
it("keeps real update errors visible", () => {
  const badge = skillUpdateBadge({ update_status: "error" }, (key) => key);
  expect(badge?.label).toBe("mySkills.updateStatus.error");
  expect(badge?.className).toContain("red");
});
it("hides reimport and source diff for unavailable import paths", () => {
  for (const source_type of ["local", "import"]) {
    expect(
      canRefreshSkill({
        source_type,
        source_ref: "~/imports/demo",
        update_status: "source_missing",
      }),
    ).toBe(false);
    expect(
      canRefreshSkill({
        source_type,
        source_ref: "~/imports/demo",
        update_status: "up_to_date",
      }),
    ).toBe(true);
  }
});
it("preserves remote updates and disables refresh for detached local copies", () => {
  expect(
    canRefreshSkill({
      source_type: "git",
      source_ref: "example/demo",
      update_status: "update_available",
    }),
  ).toBe(true);
  expect(
    canRefreshSkill({
      source_type: "local",
      source_ref: null,
      update_status: "local_only",
    }),
  ).toBe(false);
});
