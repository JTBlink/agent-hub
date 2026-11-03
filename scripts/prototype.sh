#!/usr/bin/env bash
# Compatibility shortcut; grouped implementation lives in prototype/.
set -euo pipefail
script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$script_dir/prototype/preview.sh" "$@"
