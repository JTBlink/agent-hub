import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("task status checker", () => {
  it("keeps the issue files and status index synchronized", () => {
    const output = execFileSync("node", ["scripts/check-task-status.mjs"], {
      encoding: "utf8",
    });
    expect(output).toContain("Task status index is consistent");
  });
});
