import { expect, it } from "vitest";
import {
  currentUsageWindows,
  highestUsage,
  isUsageWarning,
  type ProviderUsage,
} from "./agentUsage";

it.each([
  [0, false],
  [74.99, false],
  [75, true],
  [75.01, true],
  [80, true],
  [100, true],
])("warns at a quarter of quota remaining: %s used", (percent, warning) => {
  expect(isUsageWarning(percent)).toBe(warning);
});

it("uses the tightest live window, preserving zero and excluding expired or failed quota", () => {
  const snapshot: ProviderUsage = {
    provider: "codex",
    status: "ready",
    updated_at: 1000,
    retry_after_seconds: null,
    windows: [
      {
        key: "five_hour",
        used_percent: 0,
        resets_at: 2000,
        window_minutes: 300,
      },
      {
        key: "seven_day",
        used_percent: 85,
        resets_at: 3000,
        window_minutes: 10080,
      },
    ],
  };
  expect(highestUsage(snapshot, 1000_000)).toBe(85);
  expect(currentUsageWindows(snapshot, 2000_000)).toHaveLength(1);
  expect(highestUsage(snapshot, 3000_000)).toBeNull();
  expect(
    highestUsage({ ...snapshot, windows: [snapshot.windows[0]] }, 1000_000),
  ).toBe(0);
  expect(
    highestUsage({ ...snapshot, status: "auth_expired" }, 1000_000),
  ).toBeNull();
  expect(highestUsage(undefined)).toBeNull();
});

it("warns only for live reset credits within the inclusive 72-hour boundary", async () => {
  const { resetCreditExpiring, hasExpiringResetCredits } =
    await import("./agentUsage");
  const now = Date.now();
  const seconds = Math.floor(now / 1000);
  const credit = {
    reset_type: "codexRateLimits",
    title: null,
    expires_at: seconds + 3 * 86400,
  };
  expect(resetCreditExpiring(credit, seconds * 1000)).toBe(true);
  expect(
    resetCreditExpiring(
      { ...credit, expires_at: credit.expires_at + 1 },
      seconds * 1000,
    ),
  ).toBe(false);
  expect(
    resetCreditExpiring({ ...credit, expires_at: seconds }, seconds * 1000),
  ).toBe(false);
  expect(resetCreditExpiring({ ...credit, expires_at: null }, now)).toBe(false);
  const snapshot: ProviderUsage = {
    provider: "codex",
    status: "ready",
    windows: [],
    updated_at: seconds,
    retry_after_seconds: null,
    reset_credits: { available_count: 2, credits: [credit] },
  };
  expect(hasExpiringResetCredits(snapshot)).toBe(true);
  expect(hasExpiringResetCredits({ ...snapshot, status: "query_failed" })).toBe(
    false,
  );
});

it("distinguishes seven-day subscription reminders from an ended cached period", async () => {
  const { subscriptionState } = await import("./agentUsage");
  const now = 1800000000;
  const snapshot: ProviderUsage = {
    provider: "codex",
    status: "ready",
    windows: [],
    updated_at: now,
    retry_after_seconds: null,
    subscription: { active_until: now + 7 * 86400, last_checked_at: null },
  };
  expect(subscriptionState(snapshot, now * 1000)).toBe("ending");
  expect(
    subscriptionState(
      {
        ...snapshot,
        subscription: {
          active_until: now + 7 * 86400 + 1,
          last_checked_at: null,
        },
      },
      now * 1000,
    ),
  ).toBe("current");
  expect(
    subscriptionState(
      {
        ...snapshot,
        subscription: { active_until: now, last_checked_at: null },
      },
      now * 1000,
    ),
  ).toBe("past");
  expect(
    subscriptionState({ ...snapshot, subscription: null }, now * 1000),
  ).toBeNull();
  expect(
    subscriptionState({ ...snapshot, status: "signed_out" }, now * 1000),
  ).toBeNull();
  expect(
    subscriptionState({ ...snapshot, provider: "claude" }, now * 1000),
  ).toBeNull();
});
