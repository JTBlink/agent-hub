import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ROOT_DIR, run, runNpm } from "./build.mjs";

export function requestedTarget(args, host) {
  const option = args.find((arg) => arg.startsWith("--target="));
  const index = args.indexOf("--target");
  return option?.slice(9) ?? (index >= 0 ? args[index + 1] : undefined) ?? host;
}

export function rustTargets(target) {
  return target === "universal-apple-darwin"
    ? ["aarch64-apple-darwin", "x86_64-apple-darwin"]
    : [target];
}

/** Stage the companion CLI before Tauri resolves bundled executables. */
export function prepareCli(
  target,
  release,
  runner = spawnSync,
  filesystem = { copyFileSync, mkdirSync },
) {
  const targetDir = resolve(ROOT_DIR, "src-tauri/target");
  const output = resolve(ROOT_DIR, "src-tauri/binaries");
  const profile = release ? "release" : "debug";
  const suffix = target.includes("windows") ? ".exe" : "";
  filesystem.mkdirSync(output, { recursive: true });
  for (const architecture of rustTargets(target)) {
    const status = run(
      "cargo",
      [
        "build",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--locked",
        "--bin",
        "agent-hub-cli",
        "--target-dir",
        targetDir,
        "--target",
        architecture,
        ...(release ? ["--release"] : []),
      ],
      (command, args, options) =>
        runner(command, args, {
          ...options,
          // Bootstrap the CLI without a bundle configuration requiring itself.
          env: { ...process.env, TAURI_CONFIG: "{}" },
        }),
    );
    if (status !== 0) return status;
    filesystem.copyFileSync(
      resolve(targetDir, architecture, profile, `agent-hub-cli${suffix}`),
      resolve(output, `agent-hub-cli-${architecture}${suffix}`),
    );
  }
  if (target === "universal-apple-darwin") {
    return run(
      "lipo",
      [
        "-create",
        ...rustTargets(target).map((arch) =>
          resolve(output, `agent-hub-cli-${arch}`),
        ),
        "-output",
        resolve(output, `agent-hub-cli-${target}`),
      ],
      runner,
    );
  }
  return 0;
}

export function main(
  args = process.argv.slice(2),
  runner = spawnSync,
  prepare = prepareCli,
) {
  const command = args[0];
  if (
    ["dev", "build"].includes(command) &&
    !args.includes("--help") &&
    !args.includes("-h")
  ) {
    const rustc = runner("rustc", ["-vV"], { encoding: "utf8" });
    const host = rustc.stdout?.match(/^host: (.+)$/m)?.[1];
    if (!host) throw new Error("Rust host target is unavailable");
    // Cargo may embed frontend assets while compiling the shared library.
    const frontend = runNpm(["run", "build"], runner);
    if (frontend !== 0) return frontend;
    const status = prepare(
      requestedTarget(args, process.env.CARGO_BUILD_TARGET || host),
      command === "build" && !args.includes("--debug"),
      runner,
    );
    if (status !== 0) return status;
    args = [...args, "--config", "src-tauri/tauri.cli.conf.json"];
    if (command === "dev")
      args.push("--config", "src-tauri/tauri.dev.conf.json");
  }
  return run(
    process.execPath,
    [resolve(ROOT_DIR, "node_modules/@tauri-apps/cli/tauri.js"), ...args],
    runner,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
