import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { assembleRelease } from "./assemble-release.mjs";

function fixture({ omit = "" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "agent-hub-release-"));
  const output = join(root, "release-assets");
  mkdirSync(join(root, "docs/development"), { recursive: true });
  mkdirSync(join(output, "nested"), { recursive: true });
  writeFileSync(
    join(root, "CHANGELOG.md"),
    "# 更新日志\n\n## [Unreleased]\n\n- 下一版本。\n\n## [1.2.3]\n\n- 已发布功能。\n\n## 版本约定\n",
  );
  writeFileSync(
    join(root, "docs/development/platform-support.md"),
    "# 平台支持矩阵\n\n支持 Windows、macOS 和 Linux。\n",
  );
  for (const extension of [".exe", ".msi", ".dmg", ".AppImage", ".deb"]) {
    if (extension !== omit) {
      writeFileSync(join(output, "nested", `AgentHub${extension}`), extension);
    }
  }
  return root;
}

describe("release assembly", () => {
  it("requires every documented installer format", async () => {
    const root = fixture({ omit: ".msi" });
    await expect(
      assembleRelease({
        root,
        outputDirectory: "release-assets",
        buildRef: "main",
      }),
    ).rejects.toThrow(".msi");
  });

  it("creates metadata and checksums for a versioned release", async () => {
    const root = fixture();
    const result = await assembleRelease({
      root,
      outputDirectory: "release-assets",
      buildRef: "refs/tags/v1.2.3",
    });

    expect(result.installers).toBe(5);
    expect(result.checksums).toBe(8);
    const notes = readFileSync(
      join(root, "release-assets/RELEASE_NOTES.md"),
      "utf8",
    );
    expect(notes).toContain("# AgentHub v1.2.3");
    expect(notes).toContain("已发布功能");
    expect(notes).not.toContain("下一版本");
    const checksums = readFileSync(
      join(root, "release-assets/SHA256SUMS"),
      "utf8",
    );
    expect(checksums).toMatch(/^[a-f0-9]{64}  \.\/CHANGELOG\.md$/m);
    for (const extension of [".exe", ".msi", ".dmg", ".AppImage", ".deb"]) {
      expect(checksums).toMatch(
        new RegExp(`^[a-f0-9]{64}  \\.\\/AgentHub\\${extension}$`, "m"),
      );
      expect(
        readFileSync(join(root, `release-assets/AgentHub${extension}`)),
      ).toBeDefined();
    }
    expect(checksums).not.toContain("./nested/");
    expect(checksums).not.toContain("SHA256SUMS");
  });

  it("uses Unreleased notes for a manual branch build", async () => {
    const root = fixture();
    await assembleRelease({
      root,
      outputDirectory: "release-assets",
      buildRef: "main",
    });

    const notes = readFileSync(
      join(root, "release-assets/RELEASE_NOTES.md"),
      "utf8",
    );
    expect(notes).toContain("# AgentHub main");
    expect(notes).toContain("下一版本");
    expect(notes).not.toContain("已发布功能");
  });

  it("rejects installer basename collisions before publishing", async () => {
    const root = fixture();
    mkdirSync(join(root, "release-assets/other"));
    writeFileSync(
      join(root, "release-assets/other", "AgentHub.exe"),
      "duplicate",
    );

    await expect(
      assembleRelease({
        root,
        outputDirectory: "release-assets",
        buildRef: "main",
      }),
    ).rejects.toThrow("Installer basename collision");
  });
});
