import { expect, it } from "vitest";
import { hasNewerAutomationVersion } from "./automationDiscovery";

it.each([
  ["1.9.0", "1.10.0", true],
  ["1.0.0-rc.1", "1.0.0", true],
  ["2.0.0", "1.0.0", false],
  ["1.0.0", "1.0.0+build.2", false],
  [null, "1.0.0", false],
  ["1.0.0", undefined, false],
  ["unknown", "1.0.0", false],
] as const)(
  "compares task releases %s → %s as update=%s",
  (installed, incoming, update) => {
    expect(hasNewerAutomationVersion(installed, incoming)).toBe(update);
  },
);
