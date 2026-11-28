import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  chooseReleaseVersion,
  parseOptions,
  readRemoteTags,
  selectReleaseVersion,
} from "./select-release-version.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const select = (current, tags, options = {}) =>
  selectReleaseVersion({ current, tags, ...options });

describe("release version selection from remote tags", () => {
  it.each([
    ["0.1.5", [], "0.1.5", "initial"],
    ["0.1.5", ["v0.1.5"], "0.1.6", "patch"],
    ["0.1.6", ["v0.1.5"], "0.1.6", "prepared"],
    ["0.1.4", ["v0.1.5"], "0.1.6", "patch"],
    ["0.1.9", ["v0.1.10", "v0.1.9"], "0.1.11", "patch"],
    ["1.9.0", ["v2.0.0", "v1.99.0"], "2.0.1", "patch"],
  ])("chooses %s with tags %j as %s", (current, tags, version, reason) => {
    expect(select(current, tags)).toMatchObject({
      version,
      tag: `v${version}`,
      reason,
    });
  });

  it("ignores unrelated and prerelease tags for stable releases", () => {
    expect(
      select("0.1.5", ["v0.1.5", "v0.2.0-beta.1", "docs-2.0.0", "v01.2.3"]),
    ).toMatchObject({ version: "0.1.6", latestTag: "v0.1.5" });
  });

  it.each([
    ["minor", "0.2.0"],
    ["major", "1.0.0"],
    ["patch", "0.1.7"],
  ])(
    "applies an explicit %s increment to the higher baseline",
    (bump, version) => {
      expect(select("0.1.6", ["v0.1.5"], { bump })).toMatchObject({ version });
      expect(select("0.1.4", ["v0.1.6"], { bump })).toMatchObject({ version });
    },
  );

  it("preserves explicit and resume versions even when the tag is occupied", () => {
    expect(select("0.1.6", ["v0.1.5"], { version: "0.1.5" })).toMatchObject({
      version: "0.1.5",
      reason: "explicit",
    });
    expect(
      select("0.1.6", ["v0.1.5"], { resumeVersion: "0.1.5" }),
    ).toMatchObject({ version: "0.1.5", reason: "resume" });
    expect(select("0.1.5", [], { version: "0.2.0-beta.1" })).toMatchObject({
      version: "0.2.0-beta.1",
    });
  });

  it("requires an explicit decision for a prerelease VERSION", () => {
    expect(() => select("0.2.0-beta.1", ["v0.1.5"])).toThrow(
      "prerelease VERSION",
    );
    expect(
      select("0.2.0-beta.1", ["v0.1.5"], { resumeVersion: "0.2.0-beta.1" }),
    ).toMatchObject({ reason: "resume" });
  });

  it.each(["0.01.5", "0.1", "0.1.5-01", "0.1.5-alpha..1", "release-next"])(
    "rejects invalid explicit version %s",
    (version) => {
      expect(() => select("0.1.5", [], { version })).toThrow(
        "Invalid explicit version",
      );
    },
  );

  it("rejects contradictory upgrade instructions", () => {
    expect(() =>
      select("0.1.5", [], { version: "0.1.6", bump: "patch" }),
    ).toThrow("cannot also request a bump");
    expect(() =>
      select("0.1.5", [], { version: "0.1.6", resumeVersion: "0.1.5" }),
    ).toThrow("either");
    expect(() => select("0.1.5", [], { bump: "auto" })).toThrow("Invalid bump");
  });

  it("counts annotated and lightweight tags only once", () => {
    const tags = readRemoteTags(
      `${"a".repeat(40)}\trefs/tags/v0.1.5\n${"b".repeat(40)}\trefs/tags/v0.1.5^{}\n${"c".repeat(40)}\trefs/tags/v0.1.4\n`,
    );
    expect(tags).toEqual(["v0.1.5", "v0.1.4"]);
    expect(() => readRemoteTags("unexpected response")).toThrow(
      "Invalid remote tag response",
    );
  });

  it("reads the chosen remote without changing VERSION or Git refs", () => {
    const root = mkdtempSync(join(tmpdir(), "release-choice-"));
    roots.push(root);
    writeFileSync(join(root, "VERSION"), "0.1.5\n");
    const run = vi.fn(() => `${"a".repeat(40)}\trefs/tags/v0.1.5`);
    expect(
      chooseReleaseVersion({ root, remote: "release-origin", run }),
    ).toMatchObject({ version: "0.1.6" });
    expect(run.mock.calls).toEqual([
      [["ls-remote", "--tags", "release-origin", "refs/tags/v*"]],
    ]);
    expect(readFileSync(join(root, "VERSION"), "utf8")).toBe("0.1.5\n");
    expect(() =>
      chooseReleaseVersion({
        root,
        run: () => {
          throw new Error("API unavailable");
        },
      }),
    ).toThrow("API unavailable");
  });

  it("parses only supported CLI options", () => {
    expect(parseOptions(["--remote", "origin", "--bump", "minor"])).toEqual({
      remote: "origin",
      bump: "minor",
    });
    for (const args of [
      ["--version"],
      ["--unknown", "value"],
      ["--remote", "origin", "--remote", "other"],
    ]) {
      expect(() => parseOptions(args)).toThrow("Invalid or duplicate");
    }
  });
});
