import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { cargoTargetDir, cleanupBuildCache } from "./build-cache.mjs";

function canRun(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return result.status === 0;
}

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
  process.exit(127);
}

const mode = process.argv[2];
const extraArgs = process.argv.slice(3);
const cargo = resolveCargo();

const baseArgs = [
  "--manifest-path",
  "src-tauri/Cargo.toml",
  "--bin",
  "agent-hub-cli",
];
const cargoArgs =
  mode === "cli"
    ? ["run", "--quiet", ...baseArgs, "--", ...extraArgs]
    : mode === "build"
      ? ["build", ...baseArgs, ...extraArgs]
      : mode === "install"
        ? [
            "install",
            "--path",
            "src-tauri",
            "--bin",
            "agent-hub-cli",
            "--locked",
            "--force",
            ...extraArgs,
          ]
        : null;

if (!cargoArgs) {
  console.error(`unknown mode: ${mode}`);
  process.exit(2);
}

const before = Date.now();
const result = spawnSync(cargo, cargoArgs, {
  stdio: "inherit",
  env: {
    ...process.env,
    PATH: `${dirname(cargo)}${delimiter}${process.env.PATH ?? ""}`,
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

const status = result.status ?? 1;
if (status === 0 && mode !== "cli") {
  const targetIndex = extraArgs.indexOf("--target-dir");
  const targetOption = extraArgs.find((arg) => arg.startsWith("--target-dir="));
  cleanupBuildCache({
    before,
    targetDir:
      targetOption?.slice(13) ??
      (targetIndex >= 0 ? extraArgs[targetIndex + 1] : undefined) ??
      cargoTargetDir(),
  });
}
process.exit(status);
