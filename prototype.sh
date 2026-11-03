#!/usr/bin/env bash
# Compatibility shortcut; the implementation lives under scripts/.
set -euo pipefail
project_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$project_dir/scripts/prototype/preview.sh" "$@"
