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
          publish: () => {},
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
        {
          before: expect.any(Number),
          targetDir: cargoTargetDir(),
          ...(mode === "cli" ? { reportToStderr: true } : {}),
        },
      ]);
    },
  );

  it.each([["--target-dir", "custom-cache"], ["--target-dir=custom-cache"]])(
    "cleans the explicitly selected build cache: %j",
    (...args) => {
      const cleanups = [];
      main(["install", ...args], {
        cargo: "cargo",
        publish: () => {},
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
    expect(plan.runArgs).toEqual(["--target-dir", "application-data"]);
    expect(plan.args).not.toContain("application-data");
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
        publish: () => {},
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

it.each(["build", "cli", "install"])(
  "publishes after a successful %s before cleanup",
  (mode) => {
    const events = [];
    expect(
      main([mode], {
        cargo: "cargo",
        env: {},
        runner: (command) => {
          events.push(command === "cargo" ? "compile" : "execute-cli");
          return { status: 0 };
        },
        publish: ({ profile }) => events.push(`publish-${profile}`),
        cleanup: () => events.push("cleanup"),
      }),
    ).toBe(0);
    expect(events).toEqual([
      "compile",
      `publish-${mode === "install" ? "release" : "debug"}`,
      ...(mode === "cli" ? ["execute-cli"] : []),
      "cleanup",
    ]);
  },
);
it("does not publish a failed build or hide failed publication", () => {
  const events = [];
  expect(
    main(["build"], {
      cargo: "cargo",
      runner: () => ({ status: 17 }),
      publish: () => events.push("publish"),
      cleanup: () => events.push("cleanup"),
    }),
  ).toBe(17);
  expect(events).toEqual([]);
  expect(
    main(["build"], {
      cargo: "cargo",
      runner: () => ({ status: 0 }),
      publish: () => {
        throw new Error("bridge is locked");
      },
      cleanup: () => events.push("cleanup"),
    }),
  ).toBe(1);
  expect(events).toEqual([]);
});

it("uses the selected CLI feature set without publishing through the standard PATH entry", () => {
  let publication;
  let compilation;
  expect(
    main(["build", "--product=personal"], {
      cargo: "cargo",
      env: {},
      cleanup: () => {},
      runner: (_command, args, options) => {
        compilation = { args, env: options.env };
        return { status: 0 };
      },
      publish: (value) => {
        publication = value;
      },
    }),
  ).toBe(0);
  expect(compilation.args).toContain("--no-default-features");
  expect(compilation.args).not.toContain("--features");
  expect(compilation.env.AGENT_HUB_PRODUCT_ID).toBe("personal");
  expect(publication.env.AGENT_HUB_PRODUCT_HASH).toBe(
    compilation.env.AGENT_HUB_PRODUCT_HASH,
  );
  expect(publication.env.AGENT_HUB_CLI_BIN_DIR).toContain("personal-");
});
