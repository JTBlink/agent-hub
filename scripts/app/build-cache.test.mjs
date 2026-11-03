import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cargoTargetDir, pruneBuildCache } from "./build-cache.mjs";

const roots = [];
afterEach(() =>
  roots.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })),
);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "build-cache-"));
  roots.push(root);
  return root;
}

function file(path, content = "artifact", time = 10) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  utimesSync(path, time, time);
  return path;
}

function fingerprint(
  root,
  hash,
  time,
  { profile = "debug", mode = 1, features = "[]" } = {},
) {
  const path = join(
    root,
    profile,
    ".fingerprint",
    `agent-hub-${hash}`,
    "lib-app_lib",
  );
  file(
    `${path}.json`,
    JSON.stringify({ profile: mode, features, rustflags: [], config: 1 }),
  );
  file(path, "0123456789abcdef", time);
  // Directory mtimes participate in the concurrent-write guard too. Use the
  // fixture's historical time instead of a fractional real-time mtime that
  // can fall after Date.now() within the same millisecond on Linux.
  utimesSync(dirname(path), time, time);
}

// Rust archives on macOS use BSD extended names; GNU uses a string table.
function archive(path, name, gnu = false) {
  const member = (label, body) => {
    const header = `${label.padEnd(16)}${"0".padEnd(12)}${"0".padEnd(6)}${"0".padEnd(6)}${"644".padEnd(8)}${String(body.length).padEnd(10)}\x60\n`;
    return header + body + (body.length % 2 ? "\n" : "");
  };
  file(
    path,
    "!<arch>\n" +
      (gnu
        ? member("//", `${name}/\n`) + member("/0", "object")
        : member(`#1/${name.length}`, name + "object")),
  );
}

describe("build cache retention", () => {
  it.each([false, true])(
    "prunes historical objects while preserving current archive members (GNU=%s)",
    (gnu) => {
      const root = fixture();
      const deps = join(root, "debug/deps");
      const currentName = "app_lib.current.latest.rcgu.o";
      archive(join(deps, "libapp_lib.rlib"), currentName, gnu);
      const current = file(join(deps, currentName));
      const old = file(join(deps, "app_lib.old.session.rcgu.o"));
      const oldLink = join(deps, "app_lib.old.duplicate.rcgu.o");
      linkSync(old, oldLink);
      const dependency = file(join(deps, "libserde-0123456789abcdef.rlib"));
      const binary = file(join(root, "debug/agent-hub"));
      const incremental = file(
        join(root, "debug/incremental/session/unchanged.o"),
      );

      expect(pruneBuildCache({ targetDir: root, dryRun: true })).toEqual(
        expect.arrayContaining([old, oldLink]),
      );
      expect(existsSync(old)).toBe(true);
      pruneBuildCache({ targetDir: root });
      expect(existsSync(old)).toBe(false);
      expect(existsSync(oldLink)).toBe(false);
      for (const path of [current, dependency, binary, incremental])
        expect(existsSync(path)).toBe(true);
      expect(pruneBuildCache({ targetDir: root })).toEqual([]);
    },
  );

  it("keeps the latest application artifact per profile, mode, features and architecture", () => {
    const root = fixture();
    const old = "1111111111111111",
      current = "2222222222222222",
      check = "3333333333333333",
      feature = "4444444444444444";
    for (const target of [root, join(root, "aarch64-apple-darwin")]) {
      fingerprint(target, old, 10);
      fingerprint(target, current, 20);
      fingerprint(target, check, 5, { mode: 2 });
      fingerprint(target, feature, 5, { features: '["tray"]' });
      fingerprint(target, old, 5, { profile: "release" });
      for (const hash of [old, current, check, feature])
        file(join(target, "debug/deps", `libapp_lib-${hash}.rmeta`));
      file(join(target, "release/deps", `libapp_lib-${old}.rlib`));
    }
    pruneBuildCache({ targetDir: root });
    for (const target of [root, join(root, "aarch64-apple-darwin")]) {
      expect(
        existsSync(join(target, "debug/deps", `libapp_lib-${old}.rmeta`)),
      ).toBe(false);
      expect(
        existsSync(join(target, "debug/.fingerprint", `agent-hub-${old}`)),
      ).toBe(false);
      for (const hash of [current, check, feature])
        expect(
          existsSync(join(target, "debug/deps", `libapp_lib-${hash}.rmeta`)),
        ).toBe(true);
      expect(
        existsSync(join(target, "release/deps", `libapp_lib-${old}.rlib`)),
      ).toBe(true);
    }
  });

  it("removes old installers and their signatures without mixing architectures or formats", () => {
    const root = fixture(),
      bundle = join(root, "release/bundle/dmg");
    const old = file(join(bundle, "AgentHub_0.1.8_aarch64.dmg"));
    const signature = file(`${old}.sig`);
    const current = file(
      join(bundle, "AgentHub_0.1.9_aarch64.dmg"),
      "latest",
      20,
    );
    const otherArch = file(join(bundle, "AgentHub_0.1.8_x64.dmg"));
    const otherFormat = file(join(bundle, "AgentHub_0.1.8_aarch64.msi"));
    pruneBuildCache({ targetDir: root });
    expect(existsSync(old)).toBe(false);
    expect(existsSync(signature)).toBe(false);
    for (const path of [current, otherArch, otherFormat])
      expect(existsSync(path)).toBe(true);
  });

  it("leaves objects alone if the current archive is missing and aborts on a corrupt archive", () => {
    const root = fixture(),
      deps = join(root, "debug/deps");
    const object = file(join(deps, "app_lib.old.session.rcgu.o"));
    expect(pruneBuildCache({ targetDir: root })).toEqual([]);
    file(join(deps, "libapp_lib.rlib"), "broken");
    expect(() => pruneBuildCache({ targetDir: root })).toThrow();
    expect(existsSync(object)).toBe(true);
  });

  it("preserves hyphenated architecture and format suffixes in installer groups", () => {
    const root = fixture(),
      bundle = join(root, "release/bundle/installers");
    const old = file(join(bundle, "AgentHub-0.1.8-x64.msi"));
    const current = file(join(bundle, "AgentHub-0.1.9-x64.msi"), "latest", 20);
    const otherArch = file(join(bundle, "AgentHub-0.1.8-arm64.msi"));
    const otherFormat = file(join(bundle, "AgentHub-0.1.8-x64.exe"));
    pruneBuildCache({ targetDir: root });
    expect(existsSync(old)).toBe(false);
    for (const path of [current, otherArch, otherFormat])
      expect(existsSync(path)).toBe(true);
  });

  it("retains only the latest incremental test-object session for an unchanged artifact hash", () => {
    const root = fixture(),
      deps = join(root, "debug/deps");
    const prefix = "app_lib-1111111111111111";
    const old = file(
      join(deps, `${prefix}.unit1.oldsession.rcgu.o`),
      "old",
      10,
    );
    const current = file(
      join(deps, `${prefix}.unit1.newsession.rcgu.o`),
      "latest",
      20,
    );
    const unchanged = file(
      join(deps, `${prefix}.unit2.newsession.rcgu.o`),
      "reused",
      5,
    );
    const nonincremental = file(
      join(deps, `${prefix}.app_lib.codegen-cgu.0.rcgu.o`),
      "codegen",
      5,
    );
    pruneBuildCache({ targetDir: root });
    expect(existsSync(old)).toBe(false);
    for (const path of [current, unchanged, nonincremental])
      expect(existsSync(path)).toBe(true);
  });

  it("preserves artifacts updated after the invoking build started", () => {
    const root = fixture(),
      deps = join(root, "debug/deps");
    archive(join(deps, "libapp_lib.rlib"), "app_lib.current.latest.rcgu.o");
    const old = file(join(deps, "app_lib.old.session.rcgu.o"), "old", 10);
    const newer = file(
      join(deps, "app_lib.other.session.rcgu.o"),
      "active",
      30,
    );
    pruneBuildCache({ targetDir: root, before: 20000 });
    expect(existsSync(old)).toBe(false);
    expect(existsSync(newer)).toBe(true);
  });

  it("does not follow target, profile or bundle directory symlinks", () => {
    const root = fixture(),
      external = fixture();
    const old = file(
      join(external, "release/bundle/dmg/AgentHub_0.1.8_aarch64.dmg"),
    );
    file(
      join(external, "release/bundle/dmg/AgentHub_0.1.9_aarch64.dmg"),
      "latest",
      20,
    );
    const kind = process.platform === "win32" ? "junction" : "dir";
    symlinkSync(external, join(root, "target"), kind);
    expect(pruneBuildCache({ targetDir: join(root, "target") })).toEqual([]);
    symlinkSync(join(external, "release"), join(root, "release"), kind);
    symlinkSync(external, join(root, "other-target"), kind);
    pruneBuildCache({ targetDir: root });
    expect(existsSync(old)).toBe(true);
  });

  it("resolves custom Cargo target directories relative to the repository", () => {
    const root = fixture();
    expect(cargoTargetDir(root, { CARGO_TARGET_DIR: "cache" })).toBe(
      join(root, "cache"),
    );
  });
});
