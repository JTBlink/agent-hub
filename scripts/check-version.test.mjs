import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateVersions } from "./check-version.mjs";

function fixture({
  packageVersion = "1.2.3",
  cargoVersion = "1.2.3",
  tauriVersion = "1.2.3",
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "agent-hub-version-"));
  mkdirSync(join(root, "src-tauri"));
  writeFileSync(join(root, "VERSION"), "1.2.3\n");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ version: packageVersion }),
  );
  writeFileSync(
    join(root, "package-lock.json"),
    JSON.stringify({
      version: packageVersion,
      packages: { "": { version: packageVersion } },
    }),
  );
  writeFileSync(
    join(root, "src-tauri/Cargo.toml"),
    `[package]\nname = "agent-hub"\nversion = "${cargoVersion}"\n\n[dependencies]\n`,
  );
  writeFileSync(
    join(root, "src-tauri/Cargo.lock"),
    `[[package]]\nname = "agent-hub"\nversion = "${cargoVersion}"\n`,
  );
  writeFileSync(
    join(root, "src-tauri/tauri.conf.json"),
    JSON.stringify({ version: tauriVersion }),
  );
  return root;
}

describe("release version validation", () => {
  it("accepts consistent manifest and tag versions", () => {
    expect(validateVersions({ root: fixture(), tag: "v1.2.3" })).toBe("1.2.3");
  });

  it("rejects inconsistent manifests", () => {
    const root = fixture({ cargoVersion: "2.0.0" });
    expect(() => validateVersions({ root })).toThrow("Version mismatch");
  });

  it("rejects a stale canonical VERSION file", () => {
    const root = fixture();
    writeFileSync(join(root, "VERSION"), "9.9.9\n");
    expect(() => validateVersions({ root })).toThrow("Version mismatch");
  });

  it("rejects stale lockfile versions", () => {
    const root = fixture();
    writeFileSync(
      join(root, "package-lock.json"),
      JSON.stringify({
        version: "9.9.9",
        packages: { "": { version: "9.9.9" } },
      }),
    );
    expect(() => validateVersions({ root })).toThrow("Version mismatch");
  });

  it("rejects a stale package-lock root package version", () => {
    const root = fixture();
    writeFileSync(
      join(root, "package-lock.json"),
      JSON.stringify({
        version: "1.2.3",
        packages: { "": { version: "9.9.9" } },
      }),
    );
    expect(() => validateVersions({ root })).toThrow("Version mismatch");
  });

  it("rejects a stale Cargo.lock package version", () => {
    const root = fixture();
    writeFileSync(
      join(root, "src-tauri/Cargo.lock"),
      '[[package]]\nname = "agent-hub"\nversion = "9.9.9"\n',
    );
    expect(() => validateVersions({ root })).toThrow("Version mismatch");
  });

  it("rejects a tag that does not match the application version", () => {
    expect(() => validateVersions({ root: fixture(), tag: "v2.0.0" })).toThrow(
      "does not match application version",
    );
  });
});
