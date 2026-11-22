export const UNTAGGED_FILTER = "__untagged__";

/**
 * Drop tag filters whose pill is no longer on screen.
 * When the last skill carrying a tag is deleted the tag vanishes from the
 * available set, but a filter still selecting it would linger and silently
 * hide every remaining skill (the list looks empty for no visible reason).
 * `hasUntagged` mirrors the untagged pill's own render condition ("some skill
 * carries no tag") — that pill disappears the same way, so the sentinel has to
 * be reclaimed too.
 * Returns `prev` unchanged (same reference) when nothing is stale, so it is
 * safe to return directly from a `setState` updater without causing a loop.
 */
export function pruneStaleTagFilters(
  prev: Set<string>,
  availableTags: string[],
  hasUntagged: boolean,
): Set<string> {
  if (prev.size === 0) return prev;
  const available = new Set(availableTags);
  if (hasUntagged) available.add(UNTAGGED_FILTER);
  const cleaned = new Set([...prev].filter((tag) => available.has(tag)));
  return cleaned.size === prev.size ? prev : cleaned;
}
