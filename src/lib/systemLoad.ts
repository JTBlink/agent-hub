export interface SystemLoadSnapshot {
  cpu_percent: number | null;
  memory_used_bytes: number;
  memory_total_bytes: number;
  disk_available_bytes: number | null;
  disk_total_bytes: number | null;
}

export function loadPercent(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value)
    ? null
    : Math.min(100, Math.max(0, value));
}

export function memoryPercent(
  snapshot: SystemLoadSnapshot | null,
): number | null {
  if (!snapshot || snapshot.memory_total_bytes <= 0) return null;
  return loadPercent(
    (snapshot.memory_used_bytes / snapshot.memory_total_bytes) * 100,
  );
}

/** Binary capacity units stay consistent with the memory tooltip. */
export function diskCapacity(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  return bytes >= 1024 ** 4
    ? `${(bytes / 1024 ** 4).toFixed(1)} TiB`
    : `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}
