import { expect, it } from "vitest";
import {
  currentUsageWindows,
  highestUsage,
  type ProviderUsage,
} from "./agentUsage";

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
