import type { SkillSourceDiffEntry } from "./tauri";

/** Reverse both content and change semantics when the source is the left-hand baseline. */
export function reverseSkillDiffEntries(
  entries: SkillSourceDiffEntry[],
): SkillSourceDiffEntry[] {
  return entries.map((entry) => ({
    ...entry,
    status:
      entry.status === "added"
        ? "removed"
        : entry.status === "removed"
          ? "added"
          : "modified",
    original_text: entry.updated_text,
    updated_text: entry.original_text,
    executable_before: entry.executable_after,
    executable_after: entry.executable_before,
  }));
}
