#!/usr/bin/env bash
# Export a local prototype, or serve it explicitly for live development.
set -euo pipefail

project_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
preview_port=4176
preview_layout=""
prototype_id=index
list_only=false
open_browser=true
serve=false

usage() {
  cat <<'HELP'
用法：./prototype.sh [原型名称] [--no-open]
      ./prototype.sh [原型名称] --port 端口 [--no-open]
      ./prototype.sh --list

默认生成并打开本地 HTML；如 ./prototype.sh preview 可直达预览与浏览。
  --list       列出原型名称、用途和状态
  --port       启用开发服务，复用当前工作树的同端口服务
  --no-open    只显示预览地址
  -h, --help   显示帮助

新启动的服务在当前终端运行，按 Ctrl+C 停止。
HELP
}

while (($#)); do
  case "$1" in
    --port|--layout)
      if (($# < 2)); then
        printf '缺少 %s 的参数\n' "$1" >&2
        exit 1
      fi
      if [[ "$1" == --port ]]; then
        preview_port="$2"
        serve=true
      else
        preview_layout="$2"
      fi
      shift 2
      ;;
    --list) list_only=true; shift ;;
    --no-open) open_browser=false; shift ;;
    -h|--help) usage; exit 0 ;;
    --*) printf '未知参数：%s\n' "$1" >&2; usage >&2; exit 1 ;;
    *)
      if [[ "$prototype_id" != index ]]; then printf '只能指定一个原型。\n' >&2; exit 1; fi
      prototype_id="$1"; shift ;;
  esac
done

if [[ ! "$preview_port" =~ ^[0-9]{1,5}$ ]] || ((10#$preview_port < 1 || 10#$preview_port > 65535)); then
  printf '端口必须为 1–65535\n' >&2
  exit 1
fi
preview_port=$((10#$preview_port))
case "$preview_layout" in ""|A|B|C) ;; *) printf '布局必须为 A、B 或 C\n' >&2; exit 1 ;; esac
command -v node >/dev/null 2>&1 || { printf '需要 Node.js，请先安装项目要求的版本。\n' >&2; exit 1; }

if "$list_only"; then exec node "$project_dir/scripts/prototype/catalog.mjs" --list; fi
preview_path="$(node "$project_dir/scripts/prototype/catalog.mjs" "$prototype_id" "$preview_layout")"
open_preview() {
  if "$open_browser"; then
    if command -v open >/dev/null 2>&1; then open "$1";
    elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1";
    fi
  fi
}

if ! "$serve"; then
  if [[ ! -f "$project_dir/node_modules/vite/bin/vite.js" ]]; then
    printf '尚未安装前端依赖，请在项目根目录执行 npm ci 后重试。\n' >&2
    exit 1
  fi
  cd -- "$project_dir"
  preview_url="$(node scripts/prototype/export.mjs "$prototype_id" "$preview_layout")"
  printf '%s\n' "$preview_url"
  open_preview "$preview_url"
  exit 0
fi

preview_url="http://127.0.0.1:$preview_port$preview_path"
probe_result=0
node --input-type=module - "$preview_port" "$project_dir" <<'JS' || probe_result=$?
import http from 'node:http';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
const expected = createHash('sha256').update(realpathSync(process.argv[3])).digest('hex');
const request = http.get({
  host: '127.0.0.1', port: Number(process.argv[2]), path: '/__prototype_identity',
}, response => {
  let body = '';
  response.setEncoding('utf8');
  response.on('data', chunk => {
    body += chunk;
    if (body.length > 4096) request.destroy(new Error('Unexpected response'));
  });
  response.on('error', () => process.exit(2));
  response.on('end', () => {
    try {
      const identity = JSON.parse(body);
      process.exit(response.statusCode === 200 && identity.prototype === 'agent-hub-preview'
        && identity.checkout === expected ? 0 : 2);
    } catch { process.exit(2); }
  });
});
const deadline = setTimeout(() => request.destroy(new Error('Timeout')), 2000);
request.on('close', () => clearTimeout(deadline));
request.on('error', error => process.exit(error.code === 'ECONNREFUSED' ? 1 : 2));
JS

if ((probe_result == 0)); then
  printf '复用已有原型服务：%s\n' "$preview_url"
  open_preview "$preview_url"
  exit 0
fi
if ((probe_result != 1)); then
  printf '端口 %s 已被其他服务、其他工作树占用或无法识别，请使用 --port 指定其他端口。\n' "$preview_port" >&2
  exit 1
fi
if [[ ! -f "$project_dir/node_modules/vite/bin/vite.js" ]]; then
  printf '尚未安装前端依赖，请在项目根目录执行 npm ci 后重试。\n' >&2
  exit 1
fi

printf '启动交互原型：%s\n按 Ctrl+C 停止本次服务。\n' "$preview_url"
cd -- "$project_dir"
vite_args=(--host 127.0.0.1 --port "$preview_port" --strictPort)
if "$open_browser"; then vite_args+=(--open "$preview_path"); fi
exec node "$project_dir/node_modules/vite/bin/vite.js" "${vite_args[@]}"
