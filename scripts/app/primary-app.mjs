import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { publishBuiltCli } from "./cli-publish.mjs";
import { linkDevelopmentCli } from "./product/install-cli.mjs";
import { ROOT_DIR, run, runNpm } from "./build.mjs";
import { cargoTargetDir, cleanupBuildCache } from "./build-cache.mjs";
import {
  loadProduct,
  prepareProduct,
  productArguments,
  cargoProductArguments,
} from "./product/config.mjs";

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
  publish = publishBuiltCli,
  host,
  product,
  { updatePathCli = false, linkCli = linkDevelopmentCli } = {},
) {
  const targetDir = product?.targetDir ?? cargoTargetDir();
  const output =
    product?.binariesDir ?? resolve(ROOT_DIR, "src-tauri/binaries");
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
        ...(product ? cargoProductArguments(product) : []),
      ],
      (command, args, options) =>
        runner(command, args, {
          ...options,
          // Bootstrap the CLI without a bundle configuration requiring itself.
          env: {
            ...(product?.environment ?? process.env),
            TAURI_CONFIG: JSON.stringify(
              product ? { build: { frontendDist: product.frontendDist } } : {},
            ),
          },
        }),
    );
    if (status !== 0) return status;
    filesystem.copyFileSync(
      resolve(targetDir, architecture, profile, `agent-hub-cli${suffix}`),
      resolve(output, `agent-hub-cli-${architecture}${suffix}`),
    );
  }
  if (target === "universal-apple-darwin") {
    const fatBinary = resolve(output, `agent-hub-cli-${target}`);
    const status = run(
      "lipo",
      [
        "-create",
        ...rustTargets(target).map((arch) =>
          resolve(output, `agent-hub-cli-${arch}`),
        ),
        "-output",
        fatBinary,
      ],
      runner,
    );
    if (status !== 0) return status;
    const universalDir = resolve(targetDir, target, profile);
    filesystem.mkdirSync(universalDir, { recursive: true });
    filesystem.copyFileSync(fatBinary, resolve(universalDir, "agent-hub-cli"));
  }
  if (host && target === host) {
    // Tauri dev's desktop binary lives in the native profile directory. Keep
    // its sibling CLI current so startup cannot republish an older artifact.
    filesystem.mkdirSync(resolve(targetDir, profile), { recursive: true });
    filesystem.copyFileSync(
      resolve(targetDir, target, profile, `agent-hub-cli${suffix}`),
      resolve(targetDir, profile, `agent-hub-cli${suffix}`),
    );
  }
  try {
    publish({
      targetDir,
      target,
      profile,
      runner,
      env: product?.environment ?? process.env,
    });
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  if (updatePathCli && host && target === host && product) {
    try {
      linkCli(product, profile, {
        env: product.environment,
        replaceForeignSymlink: true,
        skipExistingFile: true,
      });
    } catch (error) {
      console.error(error.message);
      return 1;
    }
  }
  return 0;
}

export function main(
  args = process.argv.slice(2),
  runner = spawnSync,
  prepare = prepareCli,
  cleanup = cleanupBuildCache,
) {
  const selected = productArguments(args);
  args = selected.args;
  const command = args[0];
  let product;
  let productRunner = runner;
  const before = Date.now();
  const buildsRust =
    ["dev", "build"].includes(command) &&
    !args.includes("--help") &&
    !args.includes("-h");
  if (
    ["dev", "build"].includes(command) &&
    !args.includes("--help") &&
    !args.includes("-h")
  ) {
    product = prepareProduct(loadProduct(selected.selection));
    if (
      args.some(
        (arg) =>
          arg === "--features" || arg === "-f" || arg.startsWith("--features="),
      )
    )
      throw new Error(
        "Select Cargo features through the product configuration",
      );
    productRunner = (program, arguments_, options) =>
      runner(program, arguments_, {
        ...options,
        env: { ...product.environment, ...options?.env },
      });
    const rustc = productRunner("rustc", ["-vV"], { encoding: "utf8" });
    const host = rustc.stdout?.match(/^host: (.+)$/m)?.[1];
    if (!host) throw new Error("Rust host target is unavailable");
    // Cargo may embed frontend assets while compiling the shared library.
    const frontend = runNpm(["run", "build"], productRunner);
    if (frontend !== 0) return frontend;
    const target = requestedTarget(
      args,
      process.env.CARGO_BUILD_TARGET || host,
    );
    const status = prepare(
      target,
      command === "build" && !args.includes("--debug"),
      productRunner,
      undefined,
      undefined,
      host,
      product,
      { updatePathCli: command === "dev" },
    );
    if (status !== 0) return status;
    if (command === "dev") {
      // Plain Cargo builds can replace target/debug/agent-hub-cli during a
      // watch session. Keep restarts bound to the verified product sidecar.
      product.environment.AGENT_HUB_DEV_CLI = resolve(
        product.binariesDir,
        `agent-hub-cli-${target}${target.includes("windows") ? ".exe" : ""}`,
      );
    }
    const separator = args.indexOf("--");
    const trailing = separator >= 0 ? args.slice(separator + 1) : [];
    args = separator >= 0 ? args.slice(0, separator) : args;
    args.push(
      "--config",
      resolve(product.generatedDir, "tauri.product.conf.json"),
    );
    if (command === "dev")
      args.push("--config", "src-tauri/tauri.dev.conf.json");
    if (product.features.length)
      args.push("--features", product.features.join(","));
    args.push("--", "--no-default-features", ...trailing);
  }
  const status = run(
    process.execPath,
    [resolve(ROOT_DIR, "node_modules/@tauri-apps/cli/tauri.js"), ...args],
    productRunner,
  );
  if (status === 0 && buildsRust)
    cleanup({ before, targetDir: product.targetDir });
  return status;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
