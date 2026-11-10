/** Keep graph rows compact while the full subject remains available in the UI. */
export const MAX_COMMIT_SUMMARY_LENGTH = 72;

export function truncateCommitSummary(summary: string): string {
  const characters = Array.from(summary);
  if (characters.length <= MAX_COMMIT_SUMMARY_LENGTH) return summary;
  return `${characters.slice(0, MAX_COMMIT_SUMMARY_LENGTH - 1).join("")}…`;
}
