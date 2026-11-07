import { parse } from "semver";
import type { GitReferences } from "./gitApi";

export interface GitTagSort {
  by: "version" | "name" | "date";
  direction: "asc" | "desc";
}

export const DEFAULT_GIT_TAG_SORT: GitTagSort = {
  by: "date",
  direction: "desc",
};

type Entry = GitReferences["entries"][number];
const compareNames = (a: Entry, b: Entry) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/** Sort the loaded snapshot without refetching or mutating reference data. */
export function sortGitTags(entries: Entry[], sort: GitTagSort): Entry[] {
  const direction = sort.direction === "asc" ? 1 : -1;
  const compareDates = (a: Entry, b: Entry) => {
    // Tags without a usable timestamp stay last in either direction.
    if (a.time == null || b.time == null)
      return a.time == null ? (b.time == null ? 0 : 1) : -1;
    return (a.time - b.time) * direction;
  };
  const versions = new Map(
    sort.by === "version"
      ? entries.map((entry) => [
          entry.name,
          parse(entry.name.replace(/^v/, "")),
        ])
      : [],
  );
  return [...entries].sort((a, b) => {
    if (sort.by === "name") return compareNames(a, b) * direction;
    if (sort.by === "version") {
      const left = versions.get(a.name);
      const right = versions.get(b.name);
      if (left && right)
        return (left.compare(right) || compareNames(a, b)) * direction;
      if (left || right) return left ? -1 : 1;
    }
    return compareDates(a, b) || compareNames(a, b) * direction;
  });
}
