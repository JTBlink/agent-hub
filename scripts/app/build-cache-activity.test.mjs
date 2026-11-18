import { expect, it, vi } from "vitest";
import { cargoBuildActive } from "./build-cache-activity.mjs";

it.each([
  ["darwin", "/opt/rust/bin/cargo\n/usr/bin/node\n", true],
  ["linux", "/opt/rust/bin/rustc (deleted)\n", true],
  ["win32", "node\r\nC:\\Rust\\cargo.exe\r\n", true],
  ["linux", "/usr/bin/node\n/opt/bin/agent-hub-cli\n", false],
])("detects active compilers on %s", (platform, stdout, expected) => {
  const runner = vi.fn(() => ({ status: 0, stdout }));
  expect(cargoBuildActive({ platform, runner })).toBe(expected);
  expect(runner.mock.calls[0][0]).toBe(
    platform === "win32" ? "powershell.exe" : "ps",
  );
});

it("refuses cleanup when process inspection fails", () => {
  expect(() =>
    cargoBuildActive({ runner: () => ({ status: 1, stdout: "" }) }),
  ).toThrow("Cannot verify");
  expect(() =>
    cargoBuildActive({ runner: () => ({ error: Error("missing ps") }) }),
  ).toThrow("Cannot verify");
});
