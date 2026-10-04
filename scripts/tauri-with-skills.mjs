import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ROOT_DIR, run, runNpm } from "./build.mjs";

const moduleRoot = resolve(ROOT_DIR, "modules/skills");
const targetDir = resolve(moduleRoot, "src-tauri/target");
const moduleConfig = readFileSync(
  resolve(ROOT_DIR, "modules/skills-host.config.json"),
  "utf8",
);

export function requestedTarget(args, host) {
  const option = args.find((arg) => arg.startsWith("--target="));
  const index = args.indexOf("--target");
  return (
    option?.slice("--target=".length) ??
    (index >= 0 ? args[index + 1] : undefined) ??
    host
  );
}

export function rustTargets(target) {
  return target === "universal-apple-darwin"
    ? ["aarch64-apple-darwin", "x86_64-apple-darwin"]
    : [target];
}

export function prepareSkills(
  target,
  release,
  runner = spawnSync,
  filesystem = { copyFileSync, mkdirSync },
) {
  const profile = release ? "release" : "debug";
  let status = runNpm(
    ["--prefix", "modules/skills", "ci", "--no-audit", "--no-fund"],
    runner,
  );
  if (status !== 0) return status;
  status = runNpm(["--prefix", "modules/skills", "run", "build"], runner);
  if (status !== 0) return status;
  for (const architecture of rustTargets(target)) {
    status = run(
      "cargo",
      [
        "build",
        "--manifest-path",
        "modules/skills/src-tauri/Cargo.toml",
        "--locked",
        "--bins",
        "--features",
        "tauri/custom-protocol",
        "--target-dir",
        targetDir,
        "--target",
        architecture,
        ...(release ? ["--release"] : []),
      ],
      (command, args, options) =>
        runner(command, args, {
          ...options,
          env: { ...process.env, TAURI_CONFIG: moduleConfig },
        }),
    );
    if (status !== 0) return status;
  }
  const output = resolve(ROOT_DIR, "src-tauri/binaries");
  filesystem.mkdirSync(output, { recursive: true });
  for (const name of ["skills-manager", "skills-manager-cli"]) {
    const suffix = target.includes("windows") ? ".exe" : "";
    const destination = resolve(output, `${name}-${target}${suffix}`);
    // tauri-build resolves sidecars for each Rust target before universal bundling.
    for (const architecture of rustTargets(target)) {
      filesystem.copyFileSync(
        resolve(targetDir, architecture, profile, `${name}${suffix}`),
        resolve(output, `${name}-${architecture}${suffix}`),
      );
    }
    if (target === "universal-apple-darwin") {
      status = run(
        "lipo",
        [
          "-create",
          ...rustTargets(target).map((arch) =>
            resolve(targetDir, arch, profile, name),
          ),
          "-output",
          destination,
        ],
        runner,
      );
      if (status !== 0) return status;
    }
  }
  return 0;
}

export function main(args = process.argv.slice(2)) {
  const [command] = args;
  if (
    (command === "dev" || command === "build") &&
    !args.includes("--help") &&
    !args.includes("-h")
  ) {
    const rustc = spawnSync("rustc", ["-vV"], { encoding: "utf8" });
    const host = rustc.stdout?.match(/^host: (.+)$/m)?.[1];
    if (!host) throw new Error("Rust host target is unavailable");
    const target = requestedTarget(
      args,
      process.env.CARGO_BUILD_TARGET || host,
    );
    const status = prepareSkills(
      target,
      command === "build" && !args.includes("--debug"),
    );
    if (status !== 0) return status;
    args = [...args, "--config", "src-tauri/tauri.skills.conf.json"];
  }
  return run(process.execPath, [
    resolve(ROOT_DIR, "node_modules/@tauri-apps/cli/tauri.js"),
    ...args,
  ]);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
