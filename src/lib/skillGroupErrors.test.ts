import { describe, expect, it } from "vitest";
import { summarizeSkillGroupErrors } from "./skillGroupErrors";

describe("skill group operation errors", () => {
  it("reports ownership conflicts separately from real failures in a mixed batch", () => {
    expect(
      summarizeSkillGroupErrors(
        [
          { kind: "target_conflict", message: "Existing skill preserved" },
          { kind: "database", message: "Database unavailable" },
          { kind: "target_conflict", message: "Another target preserved" },
          new Error("Permission denied"),
        ],
        "Unexpected error",
      ),
    ).toEqual([
      { kind: "conflict", count: 2, message: "Existing skill preserved" },
      { kind: "failure", count: 2, message: "Database unavailable" },
    ]);
  });

  it("treats unstructured errors as failures and uses the fallback", () => {
    expect(
      summarizeSkillGroupErrors([null, "Disk full"], "Unexpected error"),
    ).toEqual([{ kind: "failure", count: 2, message: "Unexpected error" }]);
    expect(summarizeSkillGroupErrors([], "Unexpected error")).toEqual([]);
  });
});
