import { repositoryRoot } from "../shared/paths.mjs";
import { existsSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { cargoTargetDir, cleanupBuildCache } from "./build-cache.mjs";

function canRun(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return result.status === 0;
}

const ROOT = repositoryRoot;

function resolveCargo() {
  if (process.env.CARGO && existsSync(process.env.CARGO)) {
    return process.env.CARGO;
  }

  if (canRun("cargo")) {
    return "cargo";
  }

  const rustupCheck = spawnSync("rustup", ["which", "rustc"], {
    encoding: "utf8",
  });
  if (rustupCheck.status === 0) {
    const rustcPath = rustupCheck.stdout.trim();
    if (rustcPath) {
      const cargoPath = join(dirname(rustcPath), "cargo");
      if (existsSync(cargoPath)) {
        return cargoPath;
      }
    }
  }

  console.error(
    "cargo not found. Install Rust or ensure cargo/rustup is on PATH.",
  );
  return null;
}

/** Use one persistent target directory for builds, runs and Cargo installs. */
export function cliBuildPlan(mode, extraArgs, env = process.env) {
  if (!["cli", "build", "install"].includes(mode)) return null;
  // Arguments after `cli` belong to the application, not to Cargo.
  const targetIndex = mode === "cli" ? -1 : extraArgs.indexOf("--target-dir");
  const targetOption =
    mode === "cli"
      ? undefined
      : extraArgs.find((arg) => arg.startsWith("--target-dir="));
  const targetDir = resolve(
    ROOT,
    targetOption?.slice(13) ??
      (targetIndex >= 0 ? extraArgs[targetIndex + 1] : undefined) ??
      cargoTargetDir(ROOT, env),
  );
  const baseArgs = [
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--bin",
    "agent-hub-cli",
  ];
  const args =
    mode === "cli"
      ? ["run", "--quiet", ...baseArgs, "--", ...extraArgs]
      : mode === "build"
        ? ["build", ...baseArgs, ...extraArgs]
        : [
            "install",
            "--path",
            "src-tauri",
            "--bin",
            "agent-hub-cli",
            "--locked",
            "--force",
            ...extraArgs,
          ];
  return { args, targetDir };
}

export function main(
  argv = process.argv.slice(2),
  {
    runner = spawnSync,
    cleanup = cleanupBuildCache,
    cargo,
    env = process.env,
  } = {},
) {
  const [mode, ...extraArgs] = argv;
  const plan = cliBuildPlan(mode, extraArgs, env);
  if (!plan) {
    console.error(`unknown mode: ${mode}`);
    return 2;
  }
  cargo ??= resolveCargo();
  if (!cargo) return 127;
  const before = Date.now();
  const result = runner(cargo, plan.args, {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...env,
      // Cargo install otherwise uses a temporary target directory and rebuilds
      // all dependencies on every install. Share the project build cache.
      CARGO_TARGET_DIR: plan.targetDir,
      PATH: `${dirname(cargo)}${delimiter}${env.PATH ?? ""}`,
    },
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  const status = result.status ?? 1;
  if (status === 0) cleanup({ before, targetDir: plan.targetDir });
  return status;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
