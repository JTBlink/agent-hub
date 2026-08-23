import { describe, expect, it } from "vitest";

import {
  failedLegacyActionFeedback,
  legacyActionConfirmation,
  preferredCodexSkillDirectory,
  successfulLegacyActionFeedback,
} from "./legacy-codex-skill";

describe("legacy Codex Skill presentation", () => {
  const source = "~/.codex/skills/review/SKILL.md";

  it("previews the exact preferred migration destination", () => {
    expect(preferredCodexSkillDirectory(source)).toBe(
      "~/.agents/skills/review",
    );
    expect(legacyActionConfirmation(source, "migrate")).toContain(
      "~/.agents/skills/review",
    );
  });

  it("reports the recoverable archive destination", () => {
    const feedback = successfulLegacyActionFeedback({
      action: "archive",
      originalPath: "~/.codex/skills/review",
      destinationPath: "~/.agenthub/backups/legacy-codex-skills/123-review",
      backupPath: "~/.agenthub/backups/legacy-codex-skills/123-review",
    });

    expect(feedback.destinationLabel).toBe("备份位置");
    expect(feedback.destinationPath).toContain("backups/legacy-codex-skills");
  });

  it("shows string errors returned by Tauri", () => {
    expect(
      failedLegacyActionFeedback("只允许处理 ~/.codex/skills 下的 Skill 目录")
        .summary,
    ).toBe("只允许处理 ~/.codex/skills 下的 Skill 目录");
  });
});
