/** Local display time with minute precision; tooltips retain the full date and year. */
export function formatGitCommitTime(
  seconds: number,
  locale?: string,
  full = false,
): string {
  return new Date(seconds * 1000).toLocaleString(locale, {
    ...(full ? { year: "numeric" as const } : {}),
    month: full ? "2-digit" : "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
