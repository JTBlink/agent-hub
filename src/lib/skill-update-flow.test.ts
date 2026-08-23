import { describe, expect, it } from "vitest";

import type { InstalledSkill } from "./backend";
import {
  buildSkillUpdateRequest,
  currentSkillVersion,
  isSkillUpdateSupported,
} from "./skill-update-flow";

const baseSkill: InstalledSkill = {
  agent: "claude-code",
  scope: "global",
  path: "<home>/.claude/skills/review/SKILL.md",
  storageKind: "copy",
  realPath: "<home>/.claude/skills/review/SKILL.md",
  source: {
    kind: "git",
    locator: "https://github.com/example/skills.git",
    manifestPath: null,
    requestedRef: "main",
    resolvedCommit: "0123456789abcdef0123456789abcdef01234567",
  },
  displayName: "review",
  name: "review",
  relativePath: "review",
  compatibility: null,
  currentVersion: null,
  installedFingerprint: "sha256:abcdef0123456789",
  enabled: true,
  sourceTracked: true,
  category: "user",
  diagnostics: [],
};

describe("Skill update flow", () => {
  it("reuses the original source and ref", () => {
    expect(buildSkillUpdateRequest(baseSkill.source)).toEqual({
      kind: "git",
      url: "https://github.com/example/skills.git",
      requestedRef: "main",
      subdirectory: null,
    });
  });

  it("shows the declared version, then commit, then fingerprint", () => {
    expect(currentSkillVersion(baseSkill)).toBe("0123456789ab");
    expect(currentSkillVersion({ ...baseSkill, currentVersion: "1.4.0" })).toBe(
      "1.4.0",
    );
    expect(
      currentSkillVersion({
        ...baseSkill,
        source: { ...baseSkill.source, resolvedCommit: null },
      }),
    ).toBe("abcdef012345");
  });

  it("does not offer updates for unmanaged or unresolvable sources", () => {
    expect(isSkillUpdateSupported(baseSkill)).toBe(true);
    expect(isSkillUpdateSupported({ ...baseSkill, sourceTracked: false })).toBe(
      false,
    );
    expect(
      isSkillUpdateSupported({
        ...baseSkill,
        source: {
          ...baseSkill.source,
          kind: "marketplace",
          manifestPath: null,
        },
      }),
    ).toBe(false);
  });
});
