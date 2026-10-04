import { describe, it, expect } from "vitest";
import { main, prepareCli, requestedTarget } from "./primary-app.mjs";

describe("primary application packaging", () => {
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
    expect(copies).toHaveLength(2);
    expect(copies[0][1]).toMatch(/agent-hub-cli-aarch64-apple-darwin$/);
    expect(copies[1][1]).toMatch(/agent-hub-cli-x86_64-apple-darwin$/);
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
