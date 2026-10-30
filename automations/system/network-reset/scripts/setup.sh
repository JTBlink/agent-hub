#!/bin/bash
# Installs only a restricted helper. Scheduling remains in AgentHub.
set -euo pipefail
[[ "$(/usr/bin/uname -s)" == Darwin && "$EUID" -eq 0 ]] || { echo '请在 macOS 使用 sudo /bin/bash 执行此脚本' >&2; exit 1; }
service=Ethernet
seconds=5
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --service) [[ "$#" -ge 2 ]] || exit 64; service="$2"; shift 2 ;;
        --off-seconds) [[ "$#" -ge 2 ]] || exit 64; seconds="$2"; shift 2 ;;
        *) echo '参数：--service NAME --off-seconds 1..60' >&2; exit 64 ;;
    esac
done
user="${SUDO_USER:-}"
[[ "$user" =~ ^[A-Za-z_][A-Za-z0-9_.-]*$ && "$user" != root ]] || { echo '请从普通用户终端通过 sudo 执行安装' >&2; exit 1; }
[[ "$seconds" =~ ^[0-9]{1,2}$ ]] || { echo '断开时长须为 1–60 秒' >&2; exit 64; }
seconds=$((10#$seconds))
(( seconds >= 1 && seconds <= 60 )) || { echo '断开时长须为 1–60 秒' >&2; exit 64; }
/usr/sbin/networksetup -listallnetworkservices | /usr/bin/sed '1d; s/^\*//' | /usr/bin/grep -Fxq -- "$service" || { echo '网络服务不存在；运行 networksetup -listallnetworkservices 查看名称' >&2; exit 1; }
here="$(cd "$(dirname "$0")" && pwd -P)"
temporary="$(/usr/bin/mktemp -d /private/tmp/agent-hub-network-reset.XXXXXX)"
trap '/bin/rm -f "$temporary/runner" "$temporary/sudoers"; /bin/rmdir "$temporary"' EXIT
printf '#!/bin/bash\nset -euo pipefail\n[[ "$#" -eq 0 ]] || exit 64\nexec /usr/bin/env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin /bin/bash /Library/PrivilegedHelperTools/agent-hub-network-reset/reset.sh %q %q\n' "$service" "$seconds" > "$temporary/runner"
printf '%s ALL=(root) NOPASSWD: /Library/PrivilegedHelperTools/agent-hub-network-reset/run ""\n' "$user" > "$temporary/sudoers"
/usr/sbin/visudo -cf "$temporary/sudoers" >/dev/null
for path in /Library/PrivilegedHelperTools /Library/PrivilegedHelperTools/agent-hub-network-reset /Library/PrivilegedHelperTools/agent-hub-network-reset/run /Library/PrivilegedHelperTools/agent-hub-network-reset/reset.sh /etc/sudoers.d /etc/sudoers.d/agent-hub-network-reset; do
    [[ ! -L "$path" ]] || { echo '权限入口不能是符号链接' >&2; exit 1; }
done
/usr/bin/install -d -o root -g wheel -m 755 /Library/PrivilegedHelperTools /Library/PrivilegedHelperTools/agent-hub-network-reset /etc/sudoers.d
/usr/bin/install -o root -g wheel -m 755 "$here/reset.sh" /Library/PrivilegedHelperTools/agent-hub-network-reset/reset.sh
/usr/bin/install -o root -g wheel -m 755 "$temporary/runner" /Library/PrivilegedHelperTools/agent-hub-network-reset/run
/usr/bin/install -o root -g wheel -m 440 "$temporary/sudoers" /etc/sudoers.d/agent-hub-network-reset
printf '安装完成：%s，断开 %s 秒。现在可以在 AgentHub 启用计划；本次未修改网络。\n' "$service" "$seconds"
