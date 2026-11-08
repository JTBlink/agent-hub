import { afterEach, expect, it } from "vitest";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { linkDevelopmentCli } from "./install-cli.mjs";

const temporary = [];
afterEach(() =>
  temporary
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true })),
);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "agent-hub-dev-cli-"));
  temporary.push(root);
  const targetDir = join(root, "target");
  const profileDir = join(targetDir, "debug");
  const installDir = join(root, "bin");
  const oldDir = join(root, "old");
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(installDir);
  mkdirSync(oldDir);
  const name = `agent-hub-cli${process.platform === "win32" ? ".exe" : ""}`;
  const binary = join(profileDir, name);
  const oldBinary = join(oldDir, name);
  writeFileSync(binary, "new");
  writeFileSync(oldBinary, "old");
  if (process.platform !== "win32") chmodSync(binary, 0o755);
  symlinkSync(oldBinary, join(installDir, name));
  return {
    product: { id: "standard", targetDir, environment: {} },
    env: { CARGO_HOME: root },
    installDir,
    name,
    binary,
  };
}

it("dev mode can retarget an existing development symlink after a successful build", () => {
  const f = fixture();
  linkDevelopmentCli(f.product, "debug", {
    env: f.env,
    replaceForeignSymlink: true,
  });
  expect(readlinkSync(join(f.installDir, f.name))).toBe(f.binary);
});

it("keeps install --dev refusal semantics for an unrelated symlink", () => {
  const f = fixture();
  expect(() => linkDevelopmentCli(f.product, "debug", { env: f.env })).toThrow(
    "outside this product build directory",
  );
  expect(lstatSync(join(f.installDir, f.name)).isSymbolicLink()).toBe(true);
});
