import { describe, expect, it } from "vitest";

import type { InstalledSkill, UnifiedDiagnostic } from "./backend";
import {
  diagnosticProblem,
  diagnosticSubject,
  matchingSkillsForDiagnostic,
} from "./diagnostic-presentation";

function diagnostic(
  overrides: Partial<UnifiedDiagnostic> = {},
): UnifiedDiagnostic {
  return {
    code: "skill:symlink-skipped",
    kind: "source_unavailable",
    severity: "warning",
    agent: null,
    scope: null,
    resourcePath: "/repo/.claude/skills/review",
    impact: "Skill may not load",
    nextAction: "Check source",
    fixSafety: "manual",
    ...overrides,
  };
}

function installedSkill(overrides: Partial<InstalledSkill> = {}): InstalledSkill {
  return {
    agent: "codex",
    scope: "global",
    path: "/home/me/.agents/skills/review",
    storageKind: "copy",
    realPath: "/home/me/.agents/skills/review",
    source: {
      kind: "local-directory",
      locator: "/repo/.agents/skills",
      manifestPath: null,
      requestedRef: null,
      resolvedCommit: null,
    },
    displayName: "review",
    name: "review",
    relativePath: "review",
    compatibility: null,
    enabled: true,
    sourceTracked: true,
    diagnostics: [],
    ...overrides,
  };
}

describe("diagnostic presentation", () => {
  it("uses the affected skill name instead of the diagnostic code", () => {
    const item = diagnostic();

    expect(diagnosticSubject(item)).toBe("review");
    expect(diagnosticProblem(item)).toContain("符号链接");
  });

  it("uses the parent directory when the resource is SKILL.md", () => {
    expect(
      diagnosticSubject(
        diagnostic({
          code: "skill:frontmatter-missing",
          resourcePath: "/repo/.agents/skills/writer/SKILL.md",
        }),
      ),
    ).toBe("writer");
  });

  it("limits duplicate details to the affected agent", () => {
    const item = diagnostic({
      code: "skill:duplicate-name:review",
      kind: "duplicate_skill",
      agent: "codex",
      resourcePath: null,
    });
    const matches = matchingSkillsForDiagnostic(item, [
      installedSkill(),
      installedSkill({ path: "/home/me/.codex/skills/review" }),
      installedSkill({
        agent: "claude-code",
        path: "/home/me/.claude/skills/review",
      }),
      installedSkill({ name: "other", displayName: "other" }),
    ]);

    expect(diagnosticSubject(item)).toBe("review");
    expect(matches).toHaveLength(2);
    expect(matches.every((skill) => skill.agent === "codex")).toBe(true);
  });
});
