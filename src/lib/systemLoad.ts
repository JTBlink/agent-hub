export interface SystemLoadSnapshot {
  cpu_percent: number | null;
  memory_used_bytes: number;
  memory_total_bytes: number;
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
