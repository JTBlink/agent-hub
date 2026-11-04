#!/bin/bash
# The installed entry clears the environment. Stdin contains three validated
# header lines followed by bytes; no caller-supplied paths or code are accepted.
set -euo pipefail
[[ "$#" -eq 0 ]] || exit 64
IFS= read -r -n 65 expected
IFS= read -r -n 65 updated
IFS= read -r -n 37 token
[[ "$expected" =~ ^[0-9a-f]{64}$ && "$updated" =~ ^[0-9a-f]{64}$ ]] || exit 64
[[ "$token" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || exit 64
target=/private/etc/hosts
backup="/private/etc/hosts.agent-hub-$token.bak"
[[ -f "$target" && ! -L "$target" ]] || { echo HOSTS_INVALID_TARGET >&2; exit 1; }
umask 077
temporary=$(/usr/bin/mktemp -d /private/tmp/agent-hub-hosts.XXXXXX)
trap '/bin/rm -rf "$temporary"' EXIT
trap 'exit 1' HUP INT TERM
# Limit data even when invoked directly by the authorized user.
/bin/dd bs=1048577 count=1 of="$temporary/content" 2>/dev/null || exit 1
[[ $(/usr/bin/wc -c < "$temporary/content") -le 1048576 ]] || { echo HOSTS_TOO_LARGE >&2; exit 1; }
digest() { /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'; }
[[ "$(digest "$temporary/content")" == "$updated" ]] || { echo HOSTS_PAYLOAD_CHANGED >&2; exit 1; }
# The installed entry holds a kernel lock across this entire transaction.
[[ "$(digest "$target")" == "$expected" ]] || { echo HOSTS_CONFLICT >&2; exit 1; }
[[ ! -e "$backup" && ! -L "$backup" ]] || exit 1
/bin/cp -p "$target" "$backup"
if ! /bin/cat "$temporary/content" > "$target" || [[ "$(digest "$target")" != "$updated" ]]; then
  /bin/cat "$backup" > "$target" || { echo HOSTS_RESTORE_FAILED >&2; exit 1; }
  echo HOSTS_WRITE_FAILED >&2; exit 1
fi
