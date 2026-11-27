import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("installs only archives matching the product lock and preserves an existing SDK", () => {
  const directory = mkdtempSync(join(tmpdir(), "sdk-install-test-"));
  try {
    const sdk = join(directory, "agent-hub-core");
    mkdirSync(sdk);
    const version = "0.1.0";
    const revision = "a".repeat(40);
    writeFileSync(join(sdk, "SDK_VERSION"), version + "\n");
    writeFileSync(join(sdk, "SDK_REVISION"), revision + "\n");
    const archive = join(directory, "sdk.tar.gz");
    execFileSync("tar", ["-czf", archive, "-C", directory, "agent-hub-core"], {
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
    const sha256 = createHash("sha256")
      .update(readFileSync(archive))
      .digest("hex");
    const lockFile = join(directory, "sdk-lock.json");
    const destination = join(directory, "installed");
    const install = (override = {}) => {
      writeFileSync(
        lockFile,
        JSON.stringify({
          source: "sdk.tar.gz",
          version,
          revision,
          sha256,
          ...override,
        }),
      );
      return spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL("install.mjs", import.meta.url)),
          lockFile,
          destination,
        ],
        { encoding: "utf8" },
      );
    };
    expect(install({ sha256: "b".repeat(64) }).stderr).toContain(
      "SHA-256 mismatch",
    );
    expect(install({ revision: "b".repeat(40) }).stderr).toContain(
      "SDK_REVISION",
    );
    expect(install({ version: "9.0.0" }).stderr).toContain("SDK_VERSION");
    expect(existsSync(destination)).toBe(false);
    expect(install().status).toBe(0);
    expect(install().stderr).toContain("destination already exists");
    expect(readFileSync(join(destination, "SDK_VERSION"), "utf8").trim()).toBe(
      version,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
