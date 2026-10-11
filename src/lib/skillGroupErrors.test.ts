import { describe, expect, it } from "vitest";
import { summarizeSkillGroupErrors } from "./skillGroupErrors";

describe("skill group operation errors", () => {
  it("keeps both skipped skills and all failure reasons in a mixed batch", () => {
    expect(
      summarizeSkillGroupErrors(
        [
          {
            skillName: "browser",
            agentKey: "claude",
            error: {
              kind: "target_conflict",
              message: "Existing browser preserved",
            },
          },
          {
            skillName: "writer",
            agentKey: "claude",
            error: { kind: "database", message: "Database unavailable" },
          },
          {
            skillName: "reviewer",
            agentKey: "codex",
            error: {
              kind: "target_conflict",
              message: "Existing reviewer preserved",
            },
          },
          {
            skillName: "writer",
            agentKey: "codex",
            error: new Error("Permission denied"),
          },
        ],
        "Unexpected error",
      ),
    ).toEqual([
      {
        kind: "conflict",
        count: 2,
        items: [
          {
            skillName: "browser",
            agentKey: "claude",
            message: "Existing browser preserved",
          },
          {
            skillName: "reviewer",
            agentKey: "codex",
            message: "Existing reviewer preserved",
          },
        ],
      },
      {
        kind: "failure",
        count: 2,
        items: [
          {
            skillName: "writer",
            agentKey: "claude",
            message: "Database unavailable",
          },
          {
            skillName: "writer",
            agentKey: "codex",
            message: "Permission denied",
          },
        ],
      },
    ]);
  });

  it("preserves separate agents even when messages and skill names match", () => {
    const notices = summarizeSkillGroupErrors(
      ["claude", "codex"].map((agentKey) => ({
        skillName: "browser",
        agentKey,
        error: { kind: "target_conflict", message: "Shared target preserved" },
      })),
      "Unexpected error",
    );
    expect(notices[0].count).toBe(2);
    expect(notices[0].items.map((item) => item.agentKey)).toEqual([
      "claude",
      "codex",
    ]);
  });

  it("treats unstructured errors as failures and preserves every message", () => {
    expect(
      summarizeSkillGroupErrors(
        [
          { skillName: "browser", agentKey: "claude", error: null },
          { skillName: "writer", agentKey: "codex", error: "Disk full" },
        ],
        "Unexpected error",
      ),
    ).toEqual([
      {
        kind: "failure",
        count: 2,
        items: [
          {
            skillName: "browser",
            agentKey: "claude",
            message: "Unexpected error",
          },
          { skillName: "writer", agentKey: "codex", message: "Disk full" },
        ],
      },
    ]);
    expect(summarizeSkillGroupErrors([], "Unexpected error")).toEqual([]);
  });
});
