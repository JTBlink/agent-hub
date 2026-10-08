#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

install_cli() {
  local profile="${1:-debug}"
  local install_dir="${AGENT_HUB_CLI_BIN_DIR:-${CARGO_HOME:-${HOME}/.cargo}/bin}"
  local binary="${ROOT_DIR}/src-tauri/target/${profile}/agent-hub-cli"
  local link_path="${install_dir}/agent-hub-cli"

  case "${profile}" in
    debug|release) ;;
    *)
      echo "用法: $0 install [debug|release]" >&2
      return 2
      ;;
  esac

  if [[ -L "${link_path}" ]]; then
    local current_target
    current_target="$(readlink "${link_path}")"
    if [[ "${current_target}" != "${ROOT_DIR}/src-tauri/target/debug/agent-hub-cli" &&
          "${current_target}" != "${ROOT_DIR}/src-tauri/target/release/agent-hub-cli" ]]; then
      echo "拒绝覆盖其他软链接: ${link_path}" >&2
      return 1
    fi
  elif [[ -e "${link_path}" ]]; then
    echo "拒绝覆盖已有文件: ${link_path}" >&2
    return 1
  fi

  local cargo_args=(
    build
    --manifest-path "${ROOT_DIR}/src-tauri/Cargo.toml"
    --locked
    --bin agent-hub-cli
    --target-dir "${ROOT_DIR}/src-tauri/target"
  )
  if [[ "${profile}" == "release" ]]; then
    cargo_args+=(--release)
  fi

  cargo "${cargo_args[@]}"
  if [[ ! -x "${binary}" ]]; then
    echo "构建完成但未找到 CLI: ${binary}" >&2
    return 1
  fi

  mkdir -p "${install_dir}"
  ln -sfn "${binary}" "${link_path}"
  echo "已安装软链接: ${link_path} -> ${binary}"
  if [[ ":${PATH}:" != *":${install_dir}:"* ]]; then
    echo "提示: 将 ${install_dir} 加入 PATH 后可直接运行 agent-hub-cli" >&2
  fi
}

if [[ "${1:-}" == "install" ]]; then
  shift
  if [[ "$#" -gt 1 ]]; then
    echo "用法: $0 install [debug|release]" >&2
    exit 2
  fi
  install_cli "${1:-debug}"
  exit $?
fi

exec node "$ROOT_DIR/scripts/build.mjs" "$@"
