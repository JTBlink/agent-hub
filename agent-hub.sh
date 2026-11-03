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
      echo "用法: $0 install --dev [debug|release]" >&2
      return 2
      ;;
  esac

  if [[ -L "${link_path}" ]]; then
    local current_target
    current_target="$(readlink "${link_path}")"
    local relative_target="${current_target#"${ROOT_DIR}/src-tauri/target/"}"
    if [[ "${relative_target}" == "${current_target}" ||
          ! "${relative_target}" =~ ^([A-Za-z0-9_-]+/)?(debug|release)/agent-hub-cli$ ]]; then
      echo "拒绝覆盖其他软链接: ${link_path}" >&2
      return 1
    fi
  elif [[ -e "${link_path}" ]]; then
    echo "拒绝覆盖已有文件: ${link_path}" >&2
    return 1
  fi

  local cargo_args=(--locked --target-dir "${ROOT_DIR}/src-tauri/target")
  if [[ "${profile}" == "release" ]]; then
    cargo_args+=(--release)
  fi

  node "${ROOT_DIR}/scripts/app/run-rust-cli.mjs" build "${cargo_args[@]}"
  if [[ ! -x "${binary}" ]]; then
    echo "构建完成但未找到 CLI: ${binary}" >&2
    return 1
  fi

  mkdir -p "${install_dir}"
  ln -sfn "${binary}" "${link_path}"
  echo "已安装软链接: ${link_path} -> ${binary}"
  # The shared build entry already verified and published the CLI bridge.
  if [[ ":${PATH}:" != *":${install_dir}:"* ]]; then
    echo "提示: 将 ${install_dir} 加入 PATH 后可直接运行 agent-hub-cli" >&2
  fi
}

if [[ "${1:-}" == "install" ]]; then
  shift
  if [[ "${1:-}" == "--dev" ]]; then
    shift
    if [[ "$#" -gt 1 ]]; then
      echo "用法: $0 install --dev [debug|release]" >&2
      exit 2
    fi
    install_cli "${1:-debug}"
    exit $?
  fi
  exec node "$ROOT_DIR/scripts/app/build.mjs" build "$@"
fi

exec node "$ROOT_DIR/scripts/app/build.mjs" "$@"
