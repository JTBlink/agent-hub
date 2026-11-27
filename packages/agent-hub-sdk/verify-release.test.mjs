import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
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
import { repositoryRoot } from "../../scripts/shared/paths.mjs";

it("accepts the tagged candidate and rejects previews and altered downstream scripts", () => {
  const stage = mkdtempSync(join(tmpdir(), "sdk-release-verification-"));
  try {
    const source = join(stage, "agent-hub-sdk");
    const assets = join(stage, "release");
    mkdirSync(source);
    mkdirSync(assets);
    const version = readFileSync(
      new URL("VERSION", import.meta.url),
      "utf8",
    ).trim();
    const appVersion = readFileSync(
      join(repositoryRoot, "VERSION"),
      "utf8",
    ).trim();
    const revision = "a".repeat(40);
    const stem = `agent-hub-sdk-${version}`;
    const tag = `sdk-v${version}`;
    const file = `${stem}.tar.gz`;
    const archive = join(assets, file);
    writeFileSync(join(source, "SDK_VERSION"), version + "\n");
    writeFileSync(join(source, "SDK_REVISION"), revision + "\n");
    writeFileSync(join(source, "VERSION"), appVersion + "\n");
    writeFileSync(join(source, "RELEASE-NOTES.md"), "Test SDK release\n");
    copyFileSync(
      new URL("README.md", import.meta.url),
      join(source, "README.md"),
    );
    execFileSync("tar", ["-czf", archive, "-C", stage, "agent-hub-sdk"], {
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
    const sha256 = createHash("sha256")
      .update(readFileSync(archive))
      .digest("hex");
    writeFileSync(archive + ".sha256", `${sha256}  ${file}\n`);
    copyFileSync(
      join(source, "RELEASE-NOTES.md"),
      join(assets, `${stem}-RELEASE-NOTES.md`),
    );
    for (const name of ["README.md", "install.mjs", "build-product.mjs"])
      copyFileSync(
        new URL(name, import.meta.url),
        join(assets, `${stem}-${name}`),
      );

    const manifest = join(assets, `${stem}-manifest.json`);
    const writeManifest = (preview) =>
      writeFileSync(
        manifest,
        JSON.stringify({
          version,
          appVersion,
          revision,
          file,
          sha256,
          preview,
        }),
      );
    const verify = (releaseTag = tag) =>
      spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL("verify-release.mjs", import.meta.url)),
          assets,
          releaseTag,
          revision,
        ],
        { encoding: "utf8" },
      );
    writeManifest(false);
    expect(verify().status).toBe(0);
    expect(verify("v" + version).stderr).toContain("matching sdk-v tag");
    writeManifest(true);
    expect(verify().stderr).toContain("manifest does not match");
    writeManifest(false);
    writeFileSync(
      join(assets, `${stem}-install.mjs`),
      "// mismatched installer\n",
    );
    expect(verify().stderr).toContain("does not match release source");
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});
