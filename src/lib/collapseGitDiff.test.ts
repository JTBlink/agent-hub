import { expect, it } from "vitest";
import { collapseGitDiff } from "./collapseGitDiff";
import { parseGitDiff } from "./gitDiff";

it("preserves source numbers across distant changes and separated hunks", () => {
  const context = Array.from({ length: 15 }, (_, i) => ` keep ${i}`).join("\n");
  const patch = `@@ -1,17 +1,17 @@\n-old\n+new\n${context}\n-last\n+updated\n@@ -50 +50 @@\n-before\n+after\n`;
  const compact = collapseGitDiff(patch);
  expect(compact).not.toContain("keep 7");
  expect(compact).toContain("keep 2");
  expect(compact).toContain("keep 12");
  const changed = parseGitDiff(compact).rows.filter(
    (row) => row.type === "line" && row.right?.changed,
  );
  expect(
    changed.map((row) => row.type === "line" && row.right?.number),
  ).toEqual([1, 17, 50]);
});

it("retains binary messages, additions, deletions and missing-newline markers", () => {
  for (const patch of [
    "Binary files differ",
    "@@ -0,0 +1 @@\n+new\n\\ No newline at end of file\n",
    "@@ -1 +0,0 @@\n-old\n",
  ]) {
    expect(
      parseGitDiff(collapseGitDiff(patch)).rows.filter(
        (row) => row.type === "line",
      ),
    ).toEqual(parseGitDiff(patch).rows.filter((row) => row.type === "line"));
    if (patch.includes("\\ No newline"))
      expect(collapseGitDiff(patch)).toContain("\\ No newline at end of file");
  }
});
