/** Quota snapshots contain no account identifiers, tokens or transcript data. */
export type UsageProvider = "claude" | "codex";
export type UsageStatus =
  | "ready"
  | "not_installed"
  | "signed_out"
  | "unsupported"
  | "credentials_unavailable"
  | "auth_expired"
  | "permission_denied"
  | "rate_limited"
  | "network_error"
  | "invalid_response"
  | "no_data"
  | "query_failed";
export interface UsageWindow {
  key: string;
  used_percent: number;
  resets_at: number | null;
  window_minutes: number | null;
}
export interface ProviderUsage {
  provider: UsageProvider;
  status: UsageStatus;
  windows: UsageWindow[];
  updated_at: number;
  retry_after_seconds: number | null;
}
export const USAGE_PROVIDERS: UsageProvider[] = ["claude", "codex"];
export const usageAgentKey = (provider: UsageProvider) =>
  provider === "claude" ? "claude_code" : "codex";
export const usageProviderName = (provider: UsageProvider) =>
  provider === "claude" ? "Claude" : "Codex";

/** Ignore expired cached windows until the provider supplies the new quota. */
export function currentUsageWindows(
  snapshot: ProviderUsage | undefined,
  now = Date.now(),
): UsageWindow[] {
  if (snapshot?.status !== "ready") return [];
  return snapshot.windows.filter(
    (window) => window.resets_at === null || window.resets_at * 1000 > now,
  );
}

export function highestUsage(
  snapshot: ProviderUsage | undefined,
  now = Date.now(),
): number | null {
  const windows = currentUsageWindows(snapshot, now);
  return windows.length
    ? Math.max(...windows.map((window) => window.used_percent))
    : null;
}

export function quotaTime(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}
