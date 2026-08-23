import { describe, expect, it } from "vitest";

import {
  legacyActionConfirmation,
  preferredCodexSkillDirectory,
  successfulLegacyActionFeedback,
} from "./legacy-codex-skill";

describe("legacy Codex Skill presentation", () => {
  const source = "/Users/me/.codex/skills/review/SKILL.md";

  it("previews the exact preferred migration destination", () => {
    expect(preferredCodexSkillDirectory(source)).toBe(
      "/Users/me/.agents/skills/review",
    );
    expect(legacyActionConfirmation(source, "migrate")).toContain(
      "/Users/me/.agents/skills/review",
    );
  });

  it("reports the recoverable archive destination", () => {
    const feedback = successfulLegacyActionFeedback({
      action: "archive",
      originalPath: "/Users/me/.codex/skills/review",
      destinationPath:
        "/Users/me/Library/Application Support/com.jtstudio.agenthub/backups/legacy-codex-skills/123-review",
      backupPath:
        "/Users/me/Library/Application Support/com.jtstudio.agenthub/backups/legacy-codex-skills/123-review",
    });

    expect(feedback.destinationLabel).toBe("备份位置");
    expect(feedback.destinationPath).toContain("backups/legacy-codex-skills");
  });
});
