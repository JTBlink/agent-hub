#!/usr/bin/env bash

# Start the AgentHub desktop application in Tauri development mode.
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "错误：未找到 npm，请先安装 Node.js（当前 LTS）。" >&2
  exit 1
fi

APP_VERSION="$(node -p "require('./package.json').version")"
if [[ "${1:-}" == "--version" || "${1:-}" == "-V" ]]; then
  echo "AgentHub v${APP_VERSION}"
  exit 0
fi

echo "启动 AgentHub v${APP_VERSION}（开发模式）"
exec npm run tauri -- dev "$@"
