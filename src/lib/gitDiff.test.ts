import { describe, expect, it } from "vitest";
import { parseGitDiff } from "./gitDiff";

describe("parseGitDiff", () => {
  it("aligns replacements and preserves line numbers across separated hunks", () => {
    const { rows } = parseGitDiff(
      "diff --git a/demo b/demo\n--- a/demo\n+++ b/demo\n@@ -10,3 +10,4 @@ function\n context\n-old\n+new\n+extra\n last\n@@ -40 +41 @@\n-before\n+after\n",
    );
    expect(rows).toEqual([
      { type: "hunk", text: "@@ -10,3 +10,4 @@ function" },
      {
        type: "line",
        left: { number: 10, content: "context", changed: false },
        right: { number: 10, content: "context", changed: false },
      },
      {
        type: "line",
        left: { number: 11, content: "old", changed: true },
        right: { number: 11, content: "new", changed: true },
      },
      {
        type: "line",
        left: undefined,
        right: { number: 12, content: "extra", changed: true },
      },
      {
        type: "line",
        left: { number: 12, content: "last", changed: false },
        right: { number: 13, content: "last", changed: false },
      },
      { type: "hunk", text: "@@ -40 +41 @@" },
      {
        type: "line",
        left: { number: 40, content: "before", changed: true },
        right: { number: 41, content: "after", changed: true },
      },
    ]);
  });
  it("handles added and deleted files, literal header-like content and missing newlines", () => {
    expect(
      parseGitDiff(
        "@@ -0,0 +1,2 @@\n+++content\n+\n\\ No newline at end of file\n",
      ).rows,
    ).toEqual([
      { type: "hunk", text: "@@ -0,0 +1,2 @@" },
      {
        type: "line",
        left: undefined,
        right: { number: 1, content: "++content", changed: true },
      },
      {
        type: "line",
        left: undefined,
        right: { number: 2, content: "", changed: true },
      },
    ]);
    expect(parseGitDiff("@@ -1 +0,0 @@\n-old\n").rows[1]).toMatchObject({
      left: { number: 1 },
      right: undefined,
    });
    expect(parseGitDiff("Binary files a/logo and b/logo differ").rows).toEqual(
      [],
    );
  });
  it("bounds the rendered preview", () => {
    const result = parseGitDiff("@@ -0,0 +1,3 @@\n+one\n+two\n+three\n", 2);
    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(3);
    expect(JSON.stringify(result.rows)).not.toContain("three");
  });
});
