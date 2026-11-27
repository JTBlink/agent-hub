import { expect, it } from "vitest";
import { chooseSdkVersion } from "./bump-version.mjs";

const tag = (version) => `${"a".repeat(40)}\trefs/tags/sdk-v${version}`;

it("chooses the next stable SDK patch numerically from occupied SDK tags", () => {
  const refs = [tag("0.1.9"), tag("0.1.10"), tag("0.1.10^{}")].join("\n");
  expect(chooseSdkVersion("0.1.9", refs)).toMatchObject({
    version: "0.1.11",
    tag: "sdk-v0.1.11",
    latestTag: "sdk-v0.1.10",
  });
  expect(chooseSdkVersion("0.1.10", refs, "minor").version).toBe("0.2.0");
  expect(chooseSdkVersion("0.1.10", refs, "major").version).toBe("1.0.0");
});

it("reuses the initial or prepared SDK version without bumping it a second time", () => {
  expect(chooseSdkVersion("0.1.0", "").reason).toBe("initial");
  expect(chooseSdkVersion("0.2.0", tag("0.1.0"), "minor")).toMatchObject({
    version: "0.2.0",
    reason: "prepared",
  });
});
