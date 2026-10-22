import { describe, it, expect } from "vitest";
import { main, prepareCli, requestedTarget } from "./primary-app.mjs";

describe("primary application packaging", () => {
  it.each([0, 17])(
    "cleans only after successful packaging (status=%s)",
    (status) => {
      const events = [];
      const runner = (command, args) => {
        if (command === "rustc")
          return { status: 0, stdout: "host: aarch64-apple-darwin\n" };
        if (args.some((arg) => arg.endsWith("tauri.js"))) {
          events.push("package");
          return { status };
        }
        return { status: 0 };
      };
      expect(
        main(
          ["build"],
          runner,
          () => 0,
          () => events.push("cleanup"),
        ),
      ).toBe(status);
      expect(events).toEqual(
        status === 0 ? ["package", "cleanup"] : ["package"],
      );
    },
  );
  it.each(["dev", "--help"])("does not clean during %s", (command) => {
    const events = [];
    const runner = () => ({
      status: 0,
      stdout: "host: aarch64-apple-darwin\n",
    });
    main(
      [command],
      runner,
      () => 0,
      () => events.push("cleanup"),
    );
    expect(events).toEqual([]);
  });
  it("honors explicit target syntax", () => {
    expect(
      requestedTarget(["build", "--target=universal-apple-darwin"], "host"),
    ).toBe("universal-apple-darwin");
    expect(requestedTarget(["build", "--target", "test-target"], "host")).toBe(
      "test-target",
    );
  });
  it("stages both CLI architectures before creating a universal sidecar", () => {
    const calls = [],
      copies = [];
    const runner = (command, args) => {
      calls.push([command, args]);
      return { status: 0 };
    };
    expect(
      prepareCli("universal-apple-darwin", true, runner, {
        mkdirSync() {},
        copyFileSync(from, to) {
          copies.push([from, to]);
        },
      }),
    ).toBe(0);
    expect(copies).toHaveLength(3);
    expect(copies[0][1]).toMatch(/agent-hub-cli-aarch64-apple-darwin$/);
    expect(copies[1][1]).toMatch(/agent-hub-cli-x86_64-apple-darwin$/);
    expect(copies[2][1]).toMatch(
      /target\/universal-apple-darwin\/release\/agent-hub-cli$/,
    );
    expect(calls.at(-1)[0]).toBe("lipo");
    expect(
      calls
        .filter(([command]) => command === "cargo")
        .every(
          ([, args]) =>
            args.includes("agent-hub-cli") && !args.includes("--bins"),
        ),
    ).toBe(true);
  });
  it("does not start Tauri when the companion CLI fails to build", () => {
    const calls = [];
    const runner = (command, args) => {
      calls.push([command, args]);
      return { status: 0, stdout: "host: aarch64-apple-darwin\n" };
    };
    expect(main(["dev"], runner, () => 17)).toBe(17);
    expect(
      calls.some(([, args]) => args.some((arg) => arg.endsWith("tauri.js"))),
    ).toBe(false);
  });
});
