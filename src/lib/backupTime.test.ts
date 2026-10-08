import { describe, expect, it } from "vitest";
import {
  displaySnapshotLabel,
  formatDateTime,
  formatSnapshotWhen,
  snapshotDate,
} from "./backupTime";

describe("backup timestamps", () => {
  const tag = "sm-v-20261008-084448-abcdef0";

  it("reads the snapshot name as UTC and displays it in the local timezone", () => {
    expect(snapshotDate(tag)?.toISOString()).toBe("2026-10-08T08:44:48.000Z");
    expect(displaySnapshotLabel(tag, "Asia/Shanghai")).toBe(
      new Date("2026-10-08T16:44:48+08:00").toLocaleString(undefined, {
        timeZone: "Asia/Shanghai",
        timeZoneName: "short",
      }),
    );
    expect(displaySnapshotLabel(tag)).toBe(
      formatDateTime("2026-10-08T08:44:48Z"),
    );
  });

  it("keeps snapshot creation distinct from the earlier commit time", () => {
    const commit = "2026-10-08T08:44:46Z";
    expect(snapshotDate(tag)!.getTime() - new Date(commit).getTime()).toBe(
      2000,
    );
    expect(displaySnapshotLabel(tag, "Asia/Shanghai")).not.toBe(
      formatDateTime(commit, "Asia/Shanghai"),
    );
  });

  it("supports collision suffixes and daylight saving timezone conversion", () => {
    const winter = "sm-v-20260108-084448-123-abcdef0";
    const summer = "sm-v-20260708-084448-abcdef0";
    expect(snapshotDate(winter)?.toISOString()).toBe(
      "2026-01-08T08:44:48.000Z",
    );
    expect(displaySnapshotLabel(winter, "America/New_York")).toContain(
      "3:44:48",
    );
    expect(displaySnapshotLabel(summer, "America/New_York")).toContain(
      "4:44:48",
    );
  });

  it("preserves unrecognized or invalid tags instead of inventing a time", () => {
    for (const invalid of ["custom-tag", "sm-v-20260230-084448-abcdef0", ""]) {
      expect(snapshotDate(invalid)).toBeNull();
      expect(displaySnapshotLabel(invalid)).toBe(invalid);
    }
    expect(formatSnapshotWhen(null)).toBeNull();
    expect(formatDateTime("invalid")).toBe("invalid");
  });
});
