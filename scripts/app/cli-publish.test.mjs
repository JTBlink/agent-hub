import { afterEach, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  symlinkSync,
  readlinkSync,
  writeFileSync,
  readFileSync,
  rmSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishBuiltCli } from "./cli-publish.mjs";

const temporary = [];
afterEach(() =>
  temporary
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true })),
);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cli-publish-"));
  temporary.push(root);
  const bin = join(root, "bin");
  mkdirSync(bin);
  const targetDir = join(root, "target");
  const name = `agent-hub-cli${process.platform === "win32" ? ".exe" : ""}`;
  return {
    root,
    bin,
    targetDir,
    name,
    link: join(bin, name),
    env: { AGENT_HUB_CLI_BIN_DIR: bin },
  };
}

it.skipIf(process.platform === "win32")(
  "publishes the compiled executable and retargets only the existing project development link",
  () => {
    const f = fixture();
    symlinkSync(join(f.targetDir, "debug", f.name), f.link);
    const calls = [];
    publishBuiltCli({
      ...f,
      profile: "release",
      runner: (command, args) => {
        calls.push([command, args]);
        return {
          status: 0,
          stdout: JSON.stringify({
            ok: true,
            path: join(f.root, "bridge", f.name),
          }),
        };
      },
    });
    expect(calls).toEqual([
      [join(f.targetDir, "release", f.name), ["--json", "publish-cli-bridge"]],
    ]);
    expect(readlinkSync(f.link)).toBe(join(f.targetDir, "release", f.name));
  },
);

it.each(["file", "foreign-link", "absent"])(
  "preserves an unmanaged terminal entry: %s",
  (kind) => {
    const f = fixture();
    if (kind === "file") writeFileSync(f.link, "keep");
    if (kind === "foreign-link")
      symlinkSync(join(f.root, "foreign", f.name), f.link);
    publishBuiltCli({
      ...f,
      runner: () => ({
        status: 0,
        stdout: JSON.stringify({
          ok: true,
          path: join(f.root, "bridge", f.name),
        }),
      }),
    });
    if (kind === "file") expect(readFileSync(f.link, "utf8")).toBe("keep");
    if (kind === "foreign-link")
      expect(readlinkSync(f.link)).toBe(join(f.root, "foreign", f.name));
    if (kind === "absent") expect(() => lstatSync(f.link)).toThrow();
  },
);

it("skips foreign targets without executing or replacing the local CLI", () => {
  const f = fixture();
  const calls = [];
  expect(
    publishBuiltCli({
      ...f,
      target: "foreign-target",
      runner: (command) => {
        calls.push(command);
        return { status: 0, stdout: "host: native-target\n" };
      },
    }),
  ).toBe(false);
  expect(calls).toEqual(["rustc"]);
});

it.skipIf(process.platform === "win32")(
  "reports failed publication and preserves the existing development link",
  () => {
    const f = fixture();
    const previous = join(f.targetDir, "debug", f.name);
    symlinkSync(previous, f.link);
    expect(() =>
      publishBuiltCli({
        ...f,
        profile: "release",
        runner: () => ({ status: 1, stderr: "verification failed" }),
      }),
    ).toThrow("verification failed");
    expect(readlinkSync(f.link)).toBe(previous);
  },
);
