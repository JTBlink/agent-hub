import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const ROOT_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const isWindows = process.platform === "win32";
const npmCommand = isWindows ? process.env.ComSpec || "cmd.exe" : "npm";

export function usage() {
  return `用法: node scripts/build.mjs <命令> [选项]

命令:
  dev       启动 Tauri + React 开发模式
  build     编译当前平台安装包
  clean     清理 Tauri/Cargo 构建缓存
  release   打包发布产物并生成 SHA256SUMS
  test      运行前端和 Rust 测试
  lint      运行 ESLint 和 Cargo Clippy
  version   显示应用版本号
  help      显示此帮助
`;
}

export function run(command, args, runner = spawnSync) {
  const result = runner(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    windowsHide: false,
  });
  if (result.error) {
    console.error(
      `执行失败：${command} ${args.join(" ")}\n${result.error.message}`,
    );
    return 1;
  }
  return result.status ?? 1;
}

export function runNpm(args, runner = spawnSync) {
  if (!isWindows) return run(npmCommand, args, runner);
  const quote = (value) =>
    /[\s"]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
  const commandLine = ["npm.cmd", ...args.map(quote)].join(" ");
  return run(npmCommand, ["/d", "/s", "/c", commandLine], runner);
}

export function cargoAvailable(runner = spawnSync) {
  const command = isWindows ? "where.exe" : "sh";
  const args = isWindows ? ["cargo"] : ["-c", "command -v cargo"];
  return (
    runner(command, args, { cwd: ROOT_DIR, stdio: "ignore", windowsHide: true })
      .status === 0
  );
}

function requireCargo(runner) {
  if (cargoAvailable(runner)) return true;
  console.error("错误：未找到 cargo，请先安装 Rust stable。");
  return false;
}

function runRelease(args, runner) {
  const [outputDir, buildRef] = args;
  if (!outputDir || !buildRef || args.length > 2) {
    console.error("错误：release 需要指定输出目录和 git ref。");
    console.error("用法：node scripts/build.mjs release <输出目录> <git-ref>");
    return 1;
  }
  let status = run(
    process.execPath,
    ["scripts/assemble-release.mjs", outputDir, buildRef],
    runner,
  );
  if (status !== 0) return status;
  return run(
    process.execPath,
    ["scripts/verify-release-bundle.mjs", outputDir],
    runner,
  );
}

function runClean(args, runner, remove = rmSync) {
  if (args.length > 0) {
    console.error("错误：clean 不接受额外参数。");
    return 1;
  }
  if (!requireCargo(runner)) return 1;
  const status = run(
    "cargo",
    ["clean", "--manifest-path", "src-tauri/Cargo.toml"],
    runner,
  );
  if (status === 0) return 0;
  const targetDir = resolve(ROOT_DIR, "src-tauri", "target");
  if (existsSync(targetDir))
    remove(targetDir, { recursive: true, force: true });
  return 0;
}

function runTest(args, runner) {
  if (!requireCargo(runner)) return 1;
  let status = runNpm(["run", "test", ...args], runner);
  if (status === 0)
    status = run(
      "cargo",
      ["test", "--manifest-path", "src-tauri/Cargo.toml"],
      runner,
    );
  return status;
}

function runLint(runner) {
  if (!requireCargo(runner)) return 1;
  let status = runNpm(["run", "lint"], runner);
  if (status === 0)
    status = run(
      "cargo",
      [
        "fmt",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--all",
        "--",
        "--check",
      ],
      runner,
    );
  if (status === 0)
    status = run(
      "cargo",
      [
        "clippy",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--all-targets",
        "--",
        "-D",
        "warnings",
      ],
      runner,
    );
  return status;
}

function printVersion() {
  const packageJson = JSON.parse(
    readFileSync(resolve(ROOT_DIR, "package.json"), "utf8"),
  );
  console.log(`AgentHub v${packageJson.version}`);
  return 0;
}

export function runCommand(
  command,
  args,
  { runner = spawnSync, remove = rmSync } = {},
) {
  switch (command) {
    case "dev":
      return runNpm(["run", "tauri", "--", "dev", ...args], runner);
    case "build":
      return runNpm(["run", "tauri", "--", "build", ...args], runner);
    case "clean":
      return runClean(args, runner, remove);
    case "release":
      return runRelease(args, runner);
    case "test":
      return runTest(args, runner);
    case "lint":
      return runLint(runner);
    case "version":
      return printVersion();
    case "-V":
    case "--version":
      return printVersion();
    case "help":
    case "--help":
    case "-h":
      console.log(usage());
      return 0;
    default:
      console.error(`错误：未知命令 '${command}'`);
      console.error(usage());
      return 1;
  }
}

export function main(argv = process.argv.slice(2), options = {}) {
  const [command = "help", ...args] = argv;
  return runCommand(command, args, options);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  process.exitCode = main();
}
