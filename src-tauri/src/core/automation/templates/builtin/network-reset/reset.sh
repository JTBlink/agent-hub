#!/bin/bash
# Installed root-owned by setup.sh. Called only by the fixed runner.
set -euo pipefail
[[ "$EUID" -eq 0 && "$#" -eq 2 ]] || { echo '需要管理员安装的专用入口' >&2; exit 1; }
service="$1"
seconds="$2"
[[ "$seconds" =~ ^[0-9]{1,2}$ ]] || exit 64
seconds=$((10#$seconds))
(( seconds >= 1 && seconds <= 60 )) || exit 64
/usr/sbin/networksetup -listallnetworkservices | /usr/bin/sed '1d; s/^\*//' | /usr/bin/grep -Fxq -- "$service" || { echo '网络服务不存在' >&2; exit 1; }
restore_needed=false
cleanup() {
    status=$?
    trap - EXIT
    if [[ "$restore_needed" == true ]]; then
        /usr/sbin/networksetup -setnetworkserviceenabled "$service" on || {
            echo "恢复失败：请手动开启网络服务 $service" >&2
            status=1
        }
    fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '重置网络服务 %s，断开 %s 秒\n' "$service" "$seconds"
restore_needed=true
/usr/sbin/networksetup -setnetworkserviceenabled "$service" off
/bin/sleep "$seconds"
/usr/sbin/networksetup -setnetworkserviceenabled "$service" on
restore_needed=false
printf '网络服务已恢复\n'
