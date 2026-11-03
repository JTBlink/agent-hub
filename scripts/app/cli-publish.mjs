// Build hooks only: the compiled CLI owns bridge verification and atomic publication.
import { resolve, dirname, relative, basename, isAbsolute } from "node:path";
import {
  lstatSync,
  readlinkSync,
  symlinkSync,
  renameSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export function builtCliPath({ targetDir, target, profile = "debug" }) {
  return resolve(
    targetDir,
    ...(target ? [target] : []),
    profile,
    `agent-hub-cli${process.platform === "win32" ? ".exe" : ""}`,
  );
}

export function publishBuiltCli({
  targetDir,
  target,
  profile = "debug",
  env = process.env,
  runner = spawnSync,
}) {
  if (target) {
    const host = runner("rustc", ["-vV"], { encoding: "utf8", env });
    const triple = host.stdout?.match(/^host: (.+)$/m)?.[1];
    if (host.status !== 0 || !triple)
      throw new Error("Cannot verify the local Rust host before updating CLI");
    if (
      target !== triple &&
      !(target === "universal-apple-darwin" && triple.endsWith("apple-darwin"))
    ) {
      console.error(
        `CLI built for ${target}; local CLI remains unchanged (host ${triple}).`,
      );
      return false;
    }
  }
  const binary = builtCliPath({ targetDir, target, profile });
  const result = runner(binary, ["--json", "publish-cli-bridge"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `CLI bridge update failed: ${result.error?.message ?? result.stderr ?? result.status}`,
    );
  const report = JSON.parse(result.stdout);
  if (!report.ok || !report.path)
    throw new Error("CLI publication did not return a verified bridge path");
  const link = resolve(
    env.AGENT_HUB_CLI_BIN_DIR ||
      resolve(env.CARGO_HOME || resolve(homedir(), ".cargo"), "bin"),
    `agent-hub-cli${process.platform === "win32" ? ".exe" : ""}`,
  );
  let metadata;
  try {
    metadata = lstatSync(link);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (metadata?.isSymbolicLink()) {
    const previous = resolve(dirname(link), readlinkSync(link));
    const roots = [
      targetDir,
      fileURLToPath(new URL("../../src-tauri/target/", import.meta.url)),
    ];
    const managed =
      basename(previous) === basename(binary) &&
      roots.some((root) => {
        const path = relative(root, previous);
        return (
          path &&
          path !== ".." &&
          !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
          !isAbsolute(path)
        );
      });
    if (managed && previous !== binary) {
      const stage = `${link}.staged-${process.pid}`;
      try {
        symlinkSync(binary, stage);
        renameSync(stage, link);
      } finally {
        rmSync(stage, { force: true });
      }
    }
  }
  console.error(`Local CLI automatically updated from ${binary}`);
  return true;
}
