import { describe, expect, it } from "vitest";
import { basename } from "node:path";
import {
  prepareSkills,
  requestedTarget,
  rustTargets,
} from "./tauri-with-skills.mjs";

describe("bundled Skills module", () => {
  it("stages both per-architecture and universal sidecars for Tauri builds", () => {
    const copied = [];
    const combined = [];
    const status = prepareSkills(
      "universal-apple-darwin",
      true,
      (command, args) => {
        if (command === "lipo") combined.push(args);
        return { status: 0 };
      },
      {
        mkdirSync: () => {},
        copyFileSync: (source, destination) =>
          copied.push({ source, destination }),
      },
    );
    expect(status).toBe(0);
    expect(copied.map(({ destination }) => basename(destination))).toEqual([
      "skills-manager-aarch64-apple-darwin",
      "skills-manager-x86_64-apple-darwin",
      "skills-manager-cli-aarch64-apple-darwin",
      "skills-manager-cli-x86_64-apple-darwin",
    ]);
    expect(combined.map((args) => basename(args.at(-1)))).toEqual([
      "skills-manager-universal-apple-darwin",
      "skills-manager-cli-universal-apple-darwin",
    ]);
    for (const args of combined) {
      expect(args[1]).toContain("aarch64-apple-darwin");
      expect(args[2]).toContain("x86_64-apple-darwin");
    }
  });

  it("respects both target options and builds both architectures for a universal app", () => {
    expect(
      requestedTarget(["build", "--target", "universal-apple-darwin"], "host"),
    ).toBe("universal-apple-darwin");
    expect(
      requestedTarget(["build", "--target=x86_64-pc-windows-msvc"], "host"),
    ).toBe("x86_64-pc-windows-msvc");
    expect(requestedTarget(["dev"], "aarch64-apple-darwin")).toBe(
      "aarch64-apple-darwin",
    );
    expect(rustTargets("universal-apple-darwin")).toEqual([
      "aarch64-apple-darwin",
      "x86_64-apple-darwin",
    ]);
  });

  it("stops when module installation fails instead of packaging a missing manager", () => {
    const calls = [];
    const status = prepareSkills(
      "aarch64-apple-darwin",
      false,
      (command, args) => {
        calls.push({ command, args });
        return { status: 7 };
      },
    );
    expect(status).toBe(7);
    expect(calls).toHaveLength(1);
    expect(calls[0].args.join(" ")).toContain("--prefix modules/skills ci");
  });

  it("builds both binaries with embedded assets and a separate Cargo target directory", () => {
    const calls = [];
    const status = prepareSkills(
      "x86_64-pc-windows-msvc",
      true,
      (command, args, options) => {
        calls.push({ command, args, options });
        return { status: calls.length === 3 ? 9 : 0 };
      },
    );
    expect(status).toBe(9);
    expect(calls[2].command).toBe("cargo");
    const config = JSON.parse(calls[2].options.env.TAURI_CONFIG);
    expect(config.app.security.capabilities).toContain("default");
    expect(config.app.security.capabilities[1].permissions).toEqual([
      "updater:deny-download",
      "updater:deny-install",
      "updater:deny-download-and-install",
    ]);
    expect(calls[2].args).toEqual(
      expect.arrayContaining([
        "--bins",
        "--locked",
        "--features",
        "tauri/custom-protocol",
        "--release",
        "--target-dir",
        "--target",
        "x86_64-pc-windows-msvc",
      ]),
    );
  });
});
