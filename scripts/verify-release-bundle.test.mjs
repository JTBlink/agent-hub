import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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
    join(root, "package.json"),
    JSON.stringify({ version: "0.1.0" }),
  );
  writeFileSync(
    join(root, "CHANGELOG.md"),
    "# 更新日志\n\n## [Unreleased]\n\n- 下一版本。\n",
  );
  writeFileSync(
    join(root, "docs/development/platform-support.md"),
    "# 平台支持矩阵\n\nWindows、macOS、Linux。\n\n## 应用数据目录\n\n按平台保存。\n\n## V1 已知限制\n\n安装包默认未签名。\n",
  );
  for (const extension of [".exe", ".msi", ".dmg", ".AppImage", ".deb"]) {
    writeFileSync(
      join(output, "platform", `AgentHub_0.1.0_test${extension}`),
      extension,
    );
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
    writeFileSync(
      join(root, "release-assets/AgentHub_0.1.0_test.exe"),
      "tampered",
    );

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

  it("rejects extra files omitted from SHA256SUMS", async () => {
    const root = fixture();
    await assembleRelease({
      root,
      outputDirectory: "release-assets",
      buildRef: "main",
    });
    writeFileSync(join(root, "release-assets/unverified.txt"), "unexpected");

    expect(() =>
      verifyReleaseBundle({ root, bundleDirectory: "release-assets" }),
    ).toThrow("Files missing from SHA256SUMS");
  });

  it("rejects duplicate installer formats even when checksums are valid", async () => {
    const root = fixture();
    await assembleRelease({
      root,
      outputDirectory: "release-assets",
      buildRef: "main",
    });
    const duplicate = join(root, "release-assets/AgentHub_0.1.0_second.exe");
    writeFileSync(duplicate, "second executable");
    const { createHash } = await import("node:crypto");
    const digest = createHash("sha256")
      .update("second executable")
      .digest("hex");
    appendFileSync(
      join(root, "release-assets/SHA256SUMS"),
      `${digest}  ./AgentHub_0.1.0_second.exe\n`,
    );

    expect(() =>
      verifyReleaseBundle({ root, bundleDirectory: "release-assets" }),
    ).toThrow("Expected exactly one installer per format");
  });

  it("rejects installer filenames with a different application version", async () => {
    const root = fixture();
    await assembleRelease({
      root,
      outputDirectory: "release-assets",
      buildRef: "main",
    });

    expect(() =>
      verifyReleaseBundle({
        root,
        bundleDirectory: "release-assets",
        expectedVersion: "9.9.9",
      }),
    ).toThrow("Installer filename version does not match 9.9.9");
  });

  it.runIf(process.platform !== "win32")(
    "rejects symbolic links in release artifacts",
    async () => {
      const root = fixture();
      await assembleRelease({
        root,
        outputDirectory: "release-assets",
        buildRef: "main",
      });
      symlinkSync(
        join(root, "release-assets/CHANGELOG.md"),
        join(root, "release-assets/changelog-link.md"),
      );

      expect(() =>
        verifyReleaseBundle({ root, bundleDirectory: "release-assets" }),
      ).toThrow("must not contain symbolic links");
    },
  );
});
