import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ROOT_DIR, main, runCommand, usage } from "./build.mjs";

function fakeRunner(status = 0, calls = []) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    return { status };
  };
}

describe("build command orchestrator", () => {
  it("resolves the repository root from the script location", () => {
    expect(existsSync(`${ROOT_DIR}/package.json`)).toBe(true);
  });

  it("forwards dev and build commands through npm", () => {
    const calls = [];
    const runner = fakeRunner(0, calls);

    expect(runCommand("dev", ["--no-watch"], { runner })).toBe(0);
    expect(runCommand("build", ["--bundles", "nsis,msi"], { runner })).toBe(0);

    expect(calls).toHaveLength(2);
    expect(calls[0].args.join(" ")).toContain("run tauri -- dev --no-watch");
    expect(calls[1].args.join(" ")).toContain(
      "run tauri -- build --bundles nsis,msi",
    );
  });

  it("runs Rust tests after the frontend command succeeds", () => {
    const calls = [];
    const runner = fakeRunner(0, calls);

    expect(runCommand("test", [], { runner })).toBe(0);
    expect(calls.at(-1).args).toEqual([
      "test",
      "--manifest-path",
      "src-tauri/Cargo.toml",
    ]);
  });

  it("fails Rust commands when cargo is unavailable", () => {
    const calls = [];
    const runner = fakeRunner(1, calls);

    expect(runCommand("test", [], { runner })).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toMatch(/where\.exe|sh/);
  });

  it("rejects unknown commands and documents the stable interface", () => {
    expect(main(["unknown"], { runner: fakeRunner() })).toBe(1);
    expect(usage()).toContain("build     编译当前平台安装包");
  });
});
