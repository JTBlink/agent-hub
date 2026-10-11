#!/bin/sh
# Immutable executable fixture; per-test responses live beside its symlink.
[ "$1 $2 $3 $4" = 'auth token --hostname github.com' ] || exit 3
[ "$GH_PROMPT_DISABLED" = '1' ] || exit 4
fixture_dir="${0%/*}"
[ ! -f "$fixture_dir/rejected" ] || exit 1
cat "$fixture_dir/response"
