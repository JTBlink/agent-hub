import { repositoryRoot } from "../shared/paths.mjs";
import { copyFileSync, existsSync, renameSync, rmSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { builtCliPath, publishBuiltCli } from "./cli-publish.mjs";
import { cleanupBuildCache } from "./build-cache.mjs";
import {
  DEFAULT_CLI_NAME,
  loadProduct,
  prepareProduct,
  productArguments,
  cargoCliArguments,
} from "../../packages/agent-hub-core/build/config.mjs";

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

function optionValue(args, name) {
  const index = args.indexOf(name);
  return (
    args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ??
    (index >= 0 ? args[index + 1] : undefined)
  );
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
  const targetDir = resolve(
    ROOT,
    (mode === "cli" ? undefined : optionValue(extraArgs, "--target-dir")) ??
      product.targetDir,
  );
  const installRoot =
    mode === "install" && product.id !== "standard"
      ? resolve(
          ROOT,
          optionValue(extraArgs, "--root") ??
            resolve(product.generatedDir, "cli-install"),
        )
      : undefined;
  const baseArgs = [
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--bin",
    "agent-hub-cli",
    ...cargoCliArguments(product),
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
            ...(installRoot && optionValue(extraArgs, "--root") === undefined
              ? ["--root", installRoot]
              : []),
            ...cargoCliArguments(product),
            ...extraArgs,
          ];
  return {
    args,
    targetDir,
    product,
    installRoot,
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
    const requestedProfile =
      mode === "cli"
        ? "debug"
        : (optionValue(extraArgs, "--profile") ??
          (extraArgs.includes("--release") ||
          (mode === "install" && !extraArgs.includes("--debug"))
            ? "release"
            : "debug"));
    const artifact = {
      targetDir: plan.targetDir,
      target:
        (mode === "cli" ? undefined : optionValue(extraArgs, "--target")) ??
        env.CARGO_BUILD_TARGET,
      profile: requestedProfile === "dev" ? "debug" : requestedProfile,
    };
    try {
      publish({ ...artifact, runner, env });
      if (plan.installRoot && plan.product.cliName !== DEFAULT_CLI_NAME) {
        // Cargo records its fixed target name. Keep that file for Cargo and
        // expose the product command beside it.
        const installDir = resolve(plan.installRoot, "bin");
        const suffix =
          (artifact.target?.includes("windows") ?? process.platform === "win32")
            ? ".exe"
            : "";
        const dest = resolve(installDir, `${plan.product.cliName}${suffix}`);
        const staged = `${dest}.staged-${process.pid}`;
        try {
          copyFileSync(
            resolve(installDir, `${DEFAULT_CLI_NAME}${suffix}`),
            staged,
          );
          renameSync(staged, dest);
        } finally {
          rmSync(staged, { force: true });
        }
        console.error(`Installed ${plan.product.id} CLI: ${dest}`);
      }
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
