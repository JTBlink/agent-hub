import { describe, expect, it } from "vitest";
import { cliBuildPlan, main } from "./run-rust-cli.mjs";
import { cargoTargetDir } from "./build-cache.mjs";

describe("CLI build and install", () => {
  it.each(["cli", "build", "install"])(
    "reuses project artifacts in %s mode",
    (mode) => {
      const calls = [],
        cleanups = [];
      expect(
        main([mode], {
          cargo: "cargo",
          env: {},
          runner: (command, args, options) => {
            calls.push({ command, args, options });
            return { status: 0 };
          },
          cleanup: (options) => cleanups.push(options),
        }),
      ).toBe(0);
      expect(calls[0].options.env.CARGO_TARGET_DIR).toBe(cargoTargetDir());
      expect(calls[0].options.cwd).toBeTruthy();
      expect(cleanups).toEqual([
        { before: expect.any(Number), targetDir: cargoTargetDir() },
      ]);
    },
  );

  it.each([["--target-dir", "custom-cache"], ["--target-dir=custom-cache"]])(
    "cleans the explicitly selected build cache: %j",
    (...args) => {
      const cleanups = [];
      main(["install", ...args], {
        cargo: "cargo",
        env: { CARGO_TARGET_DIR: "other-cache" },
        runner: (_command, _args, options) => {
          expect(options.env.CARGO_TARGET_DIR).toMatch(/custom-cache$/);
          return { status: 0 };
        },
        cleanup: (options) => cleanups.push(options),
      });
      expect(cleanups[0].targetDir).toMatch(/custom-cache$/);
    },
  );

  it("keeps application arguments separate from Cargo options", () => {
    const plan = cliBuildPlan("cli", ["--target-dir", "application-data"], {});
    expect(plan.targetDir).toBe(cargoTargetDir());
    expect(plan.args.slice(-3)).toEqual([
      "--",
      "--target-dir",
      "application-data",
    ]);
  });

  it.each([
    { status: 17 },
    { status: null },
    { error: new Error("spawn failed") },
  ])("preserves artifacts after command failure: %j", (result) => {
    let cleaned = false;
    expect(
      main(["build"], {
        cargo: "cargo",
        runner: () => result,
        cleanup: () => {
          cleaned = true;
        },
      }),
    ).not.toBe(0);
    expect(cleaned).toBe(false);
  });

  it("rejects unknown modes before resolving Cargo or running commands", () => {
    expect(
      main(["unknown"], {
        runner: () => {
          throw new Error("unexpected spawn");
        },
      }),
    ).toBe(2);
  });
});
