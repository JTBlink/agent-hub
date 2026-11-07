import { expect, it } from "vitest";
import { DEFAULT_GIT_TAG_SORT, sortGitTags } from "./gitTagSort";
import type { GitReferences } from "./gitApi";

const entries: GitReferences["entries"] = [
  { kind: "tags", name: "v1.2.0", sha: "a", time: 30 },
  { kind: "tags", name: "v1.10.0", sha: "b", time: 20 },
  { kind: "tags", name: "v1.10.0-rc.1", sha: "c", time: 40 },
  { kind: "tags", name: "archive", sha: null, time: null },
  { kind: "tags", name: "release", sha: "d", time: 10 },
];
const names = (data: typeof entries) => data.map((entry) => entry.name);

it("preserves semantic version order and falls back to dates for non-version tags", () => {
  expect(
    names(sortGitTags(entries, { by: "version", direction: "desc" })),
  ).toEqual(["v1.10.0", "v1.10.0-rc.1", "v1.2.0", "release", "archive"]);
  expect(
    names(sortGitTags(entries, { by: "version", direction: "asc" })),
  ).toEqual(["v1.2.0", "v1.10.0-rc.1", "v1.10.0", "release", "archive"]);
  expect(names(entries)[0]).toBe("v1.2.0");
});

it("sorts names lexically and dates chronologically with missing dates always last", () => {
  expect(names(sortGitTags(entries, { by: "name", direction: "asc" }))).toEqual(
    ["archive", "release", "v1.10.0", "v1.10.0-rc.1", "v1.2.0"],
  );
  expect(names(sortGitTags(entries, DEFAULT_GIT_TAG_SORT))).toEqual([
    "v1.10.0-rc.1",
    "v1.2.0",
    "v1.10.0",
    "release",
    "archive",
  ]);
  expect(names(sortGitTags(entries, { by: "date", direction: "asc" }))).toEqual(
    ["release", "v1.10.0", "v1.2.0", "v1.10.0-rc.1", "archive"],
  );
  const tied = entries.map((entry) => ({ ...entry, time: 0 }));
  expect(names(sortGitTags(tied, { by: "date", direction: "asc" }))).toEqual(
    names(sortGitTags(entries, { by: "name", direction: "asc" })),
  );
});
