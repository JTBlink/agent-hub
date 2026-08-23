import { describe, expect, it } from "vitest";

import { buildSkillSourceRequest } from "./skill-source-flow";

describe("Skill source request builder", () => {
  it("maps B09 Git and local directory sources to the shared source seam", () => {
    expect(
      buildSkillSourceRequest({
        mode: "git",
        locator: " https://github.com/anthropics/skills.git ",
        requestedRef: " main ",
        subdirectory: " skills ",
      }),
    ).toEqual({
      kind: "git",
      url: "https://github.com/anthropics/skills.git",
      requestedRef: "main",
      subdirectory: "skills",
    });
    expect(
      buildSkillSourceRequest({
        mode: "local-directory",
        locator: " /projects/skills ",
      }),
    ).toEqual({ kind: "local-directory", path: "/projects/skills" });
  });

  it("maps B10 Marketplace and B11 skills.sh sources without leaking adapter details", () => {
    expect(
      buildSkillSourceRequest({
        mode: "marketplace",
        locator: " /repo/.claude-plugin/marketplace.json ",
      }),
    ).toEqual({
      kind: "marketplace",
      manifest: "/repo/.claude-plugin/marketplace.json",
    });
    expect(
      buildSkillSourceRequest({
        mode: "skills-sh",
        locator: " anthropics/skills ",
      }),
    ).toEqual({ kind: "skills-sh", ownerRepository: "anthropics/skills" });
  });

  it("does not create a request for an empty locator", () => {
    expect(
      buildSkillSourceRequest({ mode: "skills-sh", locator: "   " }),
    ).toBeUndefined();
  });
});
