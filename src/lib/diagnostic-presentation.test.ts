import { describe, expect, it } from "vitest";

import type { UnifiedDiagnostic } from "./backend";
import {
  diagnosticProblem,
  diagnosticSubject,
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

  it("describes the affected configuration and scope", () => {
    const item = diagnostic({
      code: "config:json-syntax",
      agent: "claude-code",
      scope: "workspace",
      resourcePath: "/repo/.claude/settings.json",
    });
    expect(diagnosticSubject(item)).toBe("Claude Code 工作空间配置");
    expect(diagnosticProblem(item)).toBe("JSON 配置存在语法错误。");
  });
});
