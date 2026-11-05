import { repositoryRoot } from "../shared/paths.mjs";
import { existsSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { builtCliPath, publishBuiltCli } from "./cli-publish.mjs";
import { cleanupBuildCache } from "./build-cache.mjs";
import {
  loadProduct,
  prepareProduct,
  productArguments,
  cargoProductArguments,
} from "./product/config.mjs";

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
  const selected = productArguments(
    extraArgs,
    env.AGENT_HUB_PRODUCT_CONFIG || env.AGENT_HUB_PRODUCT || "standard",
  );
  extraArgs = selected.args;
  if (
    mode !== "cli" &&
    extraArgs.some(
      (arg) =>
        arg === "--features" || arg === "-f" || arg.startsWith("--features="),
    )
  )
    throw new Error("Select Cargo features through --product");
  const product = loadProduct(selected.selection, { env });
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
      product.targetDir,
  );
  const baseArgs = [
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--bin",
    "agent-hub-cli",
    ...cargoProductArguments(product),
  ];
  const args =
    mode === "cli"
      ? ["build", "--quiet", ...baseArgs]
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
            ...(product.id === "standard"
              ? []
              : ["--root", resolve(product.generatedDir, "cli-install")]),
            ...cargoProductArguments(product),
            ...extraArgs,
          ];
  return {
    args,
    targetDir,
    product,
    ...(mode === "cli" ? { runArgs: extraArgs } : {}),
  };
}

export function main(
  argv = process.argv.slice(2),
  {
    runner = spawnSync,
    cleanup = cleanupBuildCache,
    cargo,
    publish = publishBuiltCli,
    env = process.env,
  } = {},
) {
  const [mode, ...extraArgs] = argv;
  const plan = cliBuildPlan(mode, extraArgs, env);
  if (!plan) {
    console.error(`unknown mode: ${mode}`);
    return 2;
  }
  prepareProduct(plan.product);
  env = {
    ...plan.product.environment,
    CARGO_TARGET_DIR: plan.targetDir,
    TAURI_CONFIG: JSON.stringify({
      build: { frontendDist: plan.product.frontendDist },
    }),
  };
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
  if (status === 0) {
    const option = (name) => {
      const index = extraArgs.indexOf(name);
      return (
        extraArgs
          .find((arg) => arg.startsWith(`${name}=`))
          ?.slice(name.length + 1) ??
        (index >= 0 ? extraArgs[index + 1] : undefined)
      );
    };
    const requestedProfile =
      mode === "cli"
        ? "debug"
        : (option("--profile") ??
          (extraArgs.includes("--release") ||
          (mode === "install" && !extraArgs.includes("--debug"))
            ? "release"
            : "debug"));
    const artifact = {
      targetDir: plan.targetDir,
      target:
        (mode === "cli" ? undefined : option("--target")) ??
        env.CARGO_BUILD_TARGET,
      profile: requestedProfile === "dev" ? "debug" : requestedProfile,
    };
    try {
      publish({ ...artifact, runner, env });
    } catch (error) {
      console.error(error.message);
      return 1;
    }
    if (mode === "cli") {
      const execution = runner(builtCliPath(artifact), plan.runArgs, {
        cwd: ROOT,
        stdio: "inherit",
        env,
      });
      if (execution.error || execution.status !== 0) {
        if (execution.error) console.error(execution.error.message);
        return execution.status ?? 1;
      }
    }
    cleanup({
      before,
      targetDir: plan.targetDir,
      ...(mode === "cli" ? { reportToStderr: true } : {}),
    });
  }
  return status;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
