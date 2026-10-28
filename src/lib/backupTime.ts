/** Git snapshot names encode UTC, independent of the machine that created them. */
export function snapshotDate(tag: string): Date | null {
  const match = tag.match(
    /^(?:sm-v-)?(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-\d{3})?(?:-[a-f\d]+)?$/i,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) || date.toISOString() !== iso
    ? null
    : date;
}

export function formatDateTime(iso: string, timeZone?: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { timeZone, timeZoneName: "short" });
}

export function displaySnapshotLabel(tag: string, timeZone?: string): string {
  const date = snapshotDate(tag);
  return date
    ? formatDateTime(date.toISOString(), timeZone)
    : /^[a-f\d]{40}$/i.test(tag)
      ? tag.slice(0, 8)
      : tag;
}

export function backupVersionLabel(
  version: { tag: string; committed_at: string },
  timeZone?: string,
): string {
  return snapshotDate(version.tag)
    ? displaySnapshotLabel(version.tag, timeZone)
    : version.committed_at
      ? formatDateTime(version.committed_at, timeZone)
      : displaySnapshotLabel(version.tag, timeZone);
}

export function currentBackupWhen(
  status: {
    current_snapshot_tag: string | null;
    last_commit_time: string | null;
  } | null,
): string | null {
  return (
    formatSnapshotWhen(status?.current_snapshot_tag ?? null) ??
    (status?.last_commit_time ? formatDateTime(status.last_commit_time) : null)
  );
}

export function formatSnapshotWhen(tag: string | null): string | null {
  return tag ? displaySnapshotLabel(tag) : null;
}
