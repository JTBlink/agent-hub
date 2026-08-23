#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

APP_NAME="AgentHub"
APP_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")"

usage() {
  cat <<EOF
用法: $(basename "$0") <命令> [选项]

命令:
  dev       启动开发模式（Tauri + React 热重载）
  build     编译当前平台安装包
  clean     清理 Tauri/Cargo 构建缓存（图标未刷新时使用）
  release   打包发布产物并生成 SHA256SUMS
  test      运行前端和 Rust 测试
  lint      运行 ESLint 和 Cargo Clippy
  version   显示应用版本号
  help      显示此帮助，或显示指定命令的详细说明

全局选项:
  -h, --help     显示此帮助
  -V, --version  显示应用版本号

示例:
  $(basename "$0") dev
  $(basename "$0") build
  $(basename "$0") clean
  $(basename "$0") release dist/release refs/tags/v1.0.0
  $(basename "$0") test
  $(basename "$0") lint
  $(basename "$0") help release

运行 '$(basename "$0") help <命令>' 可查看各命令的详细说明。
EOF
}

usage_dev() {
  cat <<EOF
用法: $(basename "$0") dev [tauri-dev 选项]

启动 Tauri + React 开发模式，支持前端热重载和 Rust 自动重建。
额外选项会原样传给 'tauri dev'。

示例:
  $(basename "$0") dev
  $(basename "$0") dev --no-watch
EOF
}

usage_build() {
  cat <<EOF
用法: $(basename "$0") build [tauri-build 选项]

为当前平台编译生产安装包（macOS .dmg/.app、Windows .exe/.msi、Linux .AppImage/.deb）。
额外选项会原样传给 'tauri build'。

示例:
  $(basename "$0") build
  $(basename "$0") build --bundles dmg
EOF
}

usage_clean() {
  cat <<EOF
用法: $(basename "$0") clean

通过 Cargo 清理 Tauri 构建缓存、调试程序和旧安装包产物。
修改应用图标后若开发模式仍显示旧图标，请执行：

  $(basename "$0") clean
  $(basename "$0") dev
EOF
}

usage_release() {
  cat <<EOF
用法: $(basename "$0") release <输出目录> <git-ref>

将多平台构建产物收拢、展平、生成 SHA256SUMS，并从 CHANGELOG.md
提取当前版本说明写成 RELEASE_NOTES.md。完成后自动校验产物完整性。

参数:
  <输出目录>  存放各平台安装包的目录（已由 CI 构建填充）
  <git-ref>   构建对应的 git ref，例如 refs/tags/v1.0.0 或 v1.0.0

示例:
  $(basename "$0") release dist/release refs/tags/v1.0.0
EOF
}

usage_test() {
  cat <<EOF
用法: $(basename "$0") test

依次运行：
  1. npm run test       前端单元测试（Vitest）
  2. cargo test         Rust 模块测试

若任一步骤失败则立即退出并返回非零状态码。
EOF
}

usage_lint() {
  cat <<EOF
用法: $(basename "$0") lint

依次运行：
  1. npm run lint                         ESLint（TypeScript/React）
  2. cargo fmt --all -- --check           Rust 格式检查
  3. cargo clippy --all-targets -D warnings  Rust 静态分析（警告即失败）

若任一步骤失败则立即退出并返回非零状态码。
EOF
}

require_npm() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "错误：未找到 npm，请先安装 Node.js（当前 LTS）。" >&2
    exit 1
  fi
}

require_cargo() {
  if ! command -v cargo >/dev/null 2>&1; then
    echo "错误：未找到 cargo，请先安装 Rust stable。" >&2
    exit 1
  fi
}

cmd="${1:-}"

case "$cmd" in
  -h|--help)
    usage
    exit 0
    ;;
  help)
    subcmd="${2:-}"
    case "$subcmd" in
      dev)     usage_dev ;;
      build)   usage_build ;;
      clean)   usage_clean ;;
      release) usage_release ;;
      test)    usage_test ;;
      lint)    usage_lint ;;
      version) printf "用法: %s version\n\n显示应用版本号（从 package.json 读取）。\n" "$(basename "$0")" ;;
      "")      usage ;;
      *)
        echo "错误：未知命令 '$subcmd'" >&2
        echo ""
        usage
        exit 1
        ;;
    esac
    exit 0
    ;;
  -V|--version|version)
    echo "${APP_NAME} v${APP_VERSION}"
    exit 0
    ;;
  dev)
    require_npm
    shift
    echo "启动 ${APP_NAME} v${APP_VERSION}（开发模式）"
    exec npm run tauri -- dev "$@"
    ;;
  build)
    require_npm
    shift
    echo "编译 ${APP_NAME} v${APP_VERSION}（当前平台安装包）"
    exec npm run tauri -- build "$@"
    ;;
  clean)
    require_cargo
    shift
    if [[ $# -ne 0 ]]; then
      echo "错误：clean 不接受额外参数。" >&2
      usage_clean >&2
      exit 1
    fi
    echo "清理 ${APP_NAME} 的 Tauri/Cargo 构建缓存…"
    if ! cargo clean --manifest-path src-tauri/Cargo.toml; then
      echo "Cargo 清理遇到已不存在的增量文件，改为移除可再生的 src-tauri/target 目录。"
      rm -rf -- "$ROOT_DIR/src-tauri/target"
    fi
    echo "清理完成。再次执行 './agent-hub.sh dev' 将重新编译并嵌入当前图标。"
    ;;
  release)
    require_npm
    OUTPUT_DIR="${2:-}"
    BUILD_REF="${3:-}"
    if [[ -z "$OUTPUT_DIR" || -z "$BUILD_REF" ]]; then
      echo "错误：release 需要指定输出目录和 git ref。" >&2
      echo "用法：$(basename "$0") release <输出目录> <git-ref>" >&2
      exit 1
    fi
    echo "打包 ${APP_NAME} v${APP_VERSION} 发布产物 → ${OUTPUT_DIR}"
    node scripts/assemble-release.mjs "$OUTPUT_DIR" "$BUILD_REF"
    echo "校验发布产物…"
    node scripts/verify-release-bundle.mjs "$OUTPUT_DIR"
    ;;
  test)
    require_npm
    require_cargo
    shift
    echo "运行前端测试…"
    npm run test "$@"
    echo "运行 Rust 测试…"
    cargo test --manifest-path src-tauri/Cargo.toml
    ;;
  lint)
    require_npm
    require_cargo
    shift
    echo "运行 ESLint…"
    npm run lint
    echo "运行 Cargo fmt 检查…"
    cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
    echo "运行 Cargo Clippy…"
    cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
    ;;
  "")
    usage
    exit 1
    ;;
  *)
    echo "错误：未知命令 '$cmd'" >&2
    echo ""
    usage
    exit 1
    ;;
esac
