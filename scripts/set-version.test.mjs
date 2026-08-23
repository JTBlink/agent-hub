import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateVersions } from "./check-version.mjs";
import { setVersions } from "./set-version.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "agent-hub-set-version-"));
  mkdirSync(join(root, "src-tauri"));
  writeFileSync(join(root, "VERSION"), "1.0.0\n");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "agent-hub", version: "1.0.0" }),
  );
  writeFileSync(
    join(root, "package-lock.json"),
    JSON.stringify({
      name: "agent-hub",
      version: "1.0.0",
      packages: { "": { version: "1.0.0" } },
    }),
  );
  writeFileSync(
    join(root, "src-tauri/Cargo.toml"),
    '[package]\nname = "agent-hub"\nversion = "1.0.0"\n\n[dependencies]\n',
  );
  writeFileSync(
    join(root, "src-tauri/Cargo.lock"),
    '[[package]]\nname = "agent-hub"\nversion = "1.0.0"\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\n',
  );
  writeFileSync(
    join(root, "src-tauri/tauri.conf.json"),
    JSON.stringify({ version: "1.0.0" }),
  );
  return root;
}

describe("release version updates", () => {
  it("updates every release manifest and lockfile", () => {
    const root = fixture();

    expect(setVersions({ root, version: "2.1.0-beta.1" })).toBe("2.1.0-beta.1");
    expect(validateVersions({ root, tag: "v2.1.0-beta.1" })).toBe(
      "2.1.0-beta.1",
    );

    const lockfile = JSON.parse(
      readFileSync(join(root, "package-lock.json"), "utf8"),
    );
    expect(lockfile.version).toBe("2.1.0-beta.1");
    expect(lockfile.packages[""].version).toBe("2.1.0-beta.1");
    expect(readFileSync(join(root, "src-tauri/Cargo.lock"), "utf8")).toContain(
      'name = "agent-hub"\nversion = "2.1.0-beta.1"',
    );
    expect(readFileSync(join(root, "VERSION"), "utf8")).toBe("2.1.0-beta.1\n");
  });

  it("rejects invalid semantic versions without editing files", () => {
    const root = fixture();
    expect(() => setVersions({ root, version: "release-next" })).toThrow(
      "Invalid semantic version",
    );
    expect(validateVersions({ root })).toBe("1.0.0");
  });
});
