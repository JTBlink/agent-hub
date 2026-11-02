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
export interface ResetCredit {
  id?: string | null;
  reset_type: string;
  title: string | null;
  expires_at: number | null;
}
export interface ResetCredits {
  available_count: number;
  credits: ResetCredit[] | null;
}
export interface ProviderUsage {
  provider: UsageProvider;
  status: UsageStatus;
  windows: UsageWindow[];
  reset_credits?: ResetCredits | null;
  updated_at: number;
  retry_after_seconds: number | null;
}
export interface ResetResult {
  outcome: "reset" | "already_redeemed" | "nothing_to_reset" | "no_credit";
  snapshot: ProviderUsage | null;
  refresh_error: UsageStatus | null;
}
export const USAGE_PROVIDERS: UsageProvider[] = ["codex", "claude"];
export const isTransientUsageFailure = (status: UsageStatus) =>
  status === "network_error" ||
  status === "query_failed" ||
  status === "invalid_response";
export const usageAgentKey = (provider: UsageProvider) =>
  provider === "claude" ? "claude_code" : "codex";
export const usageProviderName = (provider: UsageProvider) =>
  provider === "claude" ? "Claude" : "Codex";

/** Warn when at most a quarter of the quota remains. */
export const isUsageWarning = (usedPercent: number) => usedPercent >= 75;

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

/** Warn within the final 72 hours, excluding credits that have already expired. */
export function resetCreditExpiring(
  credit: ResetCredit,
  now = Date.now(),
): boolean {
  if (credit.expires_at === null) return false;
  const remaining = credit.expires_at * 1000 - now;
  return remaining > 0 && remaining <= 3 * 24 * 60 * 60 * 1000;
}

export function hasExpiringResetCredits(
  snapshot: ProviderUsage | undefined,
  now = Date.now(),
): boolean {
  return (
    snapshot?.status === "ready" &&
    snapshot.provider === "codex" &&
    !!snapshot.reset_credits?.credits?.some((credit) =>
      resetCreditExpiring(credit, now),
    )
  );
}
