#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

publish_cli_bridge() {
  local binary="$1"
  local bridge_dir="${AGENT_HUB_BRIDGE_DIR:-${HOME}/.agent-hub/bin}"
  local bridge_path="${bridge_dir}/agent-hub-cli"
  local stamp_path="${bridge_dir}/.version"
  local staged_path="${bridge_dir}/.agent-hub-cli.staged.$$"
  local version_output
  local version

  mkdir -p "${bridge_dir}"

  version_output="$("${binary}" --version 2>/dev/null)" || {
    echo "CLI 可执行文件无法运行: ${binary}" >&2
    return 1
  }
  if [[ "${version_output}" != agent-hub-cli\ * ]]; then
    echo "CLI 版本输出格式无效: ${version_output}" >&2
    return 1
  fi
  version="${version_output##* }"

  # Remove the stamp before staging so a failed update can never leave the old
  # bridge looking trusted to manage-skills.
  rm -f "${stamp_path}"
  rm -f "${staged_path}"
  if ! cp "${binary}" "${staged_path}"; then
    rm -f "${staged_path}"
    echo "无法复制 CLI 到 bridge: ${bridge_dir}" >&2
    return 1
  fi
  chmod +x "${staged_path}"
  if ! mv -f "${staged_path}" "${bridge_path}"; then
    rm -f "${staged_path}"
    echo "无法更新 CLI bridge: ${bridge_path}" >&2
    return 1
  fi
  printf '%s\n' "${version}" >"${stamp_path}"
  echo "已更新 CLI bridge: ${bridge_path} (版本 ${version})"
}

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
  publish_cli_bridge "${binary}"
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
  exec node "$ROOT_DIR/scripts/build.mjs" build "$@"
fi

exec node "$ROOT_DIR/scripts/build.mjs" "$@"
