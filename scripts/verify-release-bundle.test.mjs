import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { assembleRelease } from "./assemble-release.mjs";
import { verifyReleaseBundle } from "./verify-release-bundle.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "agent-hub-release-verify-"));
  const output = join(root, "release-assets");
  mkdirSync(join(root, "docs/development"), { recursive: true });
  mkdirSync(join(output, "platform"), { recursive: true });
  writeFileSync(
    join(root, "CHANGELOG.md"),
    "# 更新日志\n\n## [Unreleased]\n\n- 下一版本。\n",
  );
  writeFileSync(
    join(root, "docs/development/platform-support.md"),
    "# 平台支持矩阵\n\n支持三个平台。\n",
  );
  for (const extension of [".exe", ".msi", ".dmg", ".AppImage", ".deb"]) {
    writeFileSync(join(output, "platform", `AgentHub${extension}`), extension);
  }
  return root;
}

describe("release bundle verification", () => {
  it("accepts a complete bundle with valid checksums", async () => {
    const root = fixture();
    await assembleRelease({
      root,
      outputDirectory: "release-assets",
      buildRef: "main",
    });

    const result = await verifyReleaseBundle({
      root,
      bundleDirectory: "release-assets",
    });

    expect(result.installers).toBe(5);
    expect(result.verifiedFiles).toBe(8);
  });

  it("rejects a modified installer", async () => {
    const root = fixture();
    await assembleRelease({
      root,
      outputDirectory: "release-assets",
      buildRef: "main",
    });
    writeFileSync(join(root, "release-assets/AgentHub.exe"), "tampered");

    expect(() =>
      verifyReleaseBundle({ root, bundleDirectory: "release-assets" }),
    ).toThrow("Checksum mismatch");
  });

  it("rejects checksum paths outside the bundle", async () => {
    const root = fixture();
    await assembleRelease({
      root,
      outputDirectory: "release-assets",
      buildRef: "main",
    });
    const checksums = readFileSync(
      join(root, "release-assets/SHA256SUMS"),
      "utf8",
    );
    writeFileSync(
      join(root, "release-assets/SHA256SUMS"),
      `${checksums}0000000000000000000000000000000000000000000000000000000000000000  ./../outside\n`,
    );

    expect(() =>
      verifyReleaseBundle({ root, bundleDirectory: "release-assets" }),
    ).toThrow("Unsafe checksum path");
  });
});
