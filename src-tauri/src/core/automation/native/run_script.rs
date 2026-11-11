//! Standalone current-user runners persist bounded history without a running UI.
use super::render::{ps, shell};
use std::path::Path;
pub(super) const VERSION: &str = "AgentHub workspace scripts v7";

pub(super) fn shell_script(
    dir: &Path,
    workdir: &str,
    payload: &Path,
    scripts_dir: &str,
    variables: &str,
) -> String {
    let cli = crate::core::cli_bridge::bridge_path();
    format!(
        r#"#!/bin/sh
# {version}
umask 077
base={base}
if [ -f "$base/managed" ]; then
  mkdir "$base/run.claim" 2>/dev/null || exit 0
  if [ ! -f "$base/ready" ]; then rmdir "$base/run.claim"; exit 0; fi
  trap 'rmdir "$base/run.claim" 2>/dev/null' 0
fi
mkdir -p "$base/runs" || exit 1
if [ ! -f "$base/current-run" ] && [ -f "$base/started" ]; then
  mkdir -p "$base/runs/legacy" || exit 1
  for file in started finished exit output.log; do
    [ ! -f "$base/$file" ] || cp "$base/$file" "$base/runs/legacy/$file"
  done
fi
run=$(date -u '+%Y%m%dT%H%M%SZ')-$$
record="$base/runs/$run"
mkdir "$record" || exit 1
exec >"$record/output.log" 2>&1
rm -f "$base/exit" "$base/finished"
date -u '+%Y-%m-%dT%H:%M:%SZ' >"$record/started"
cp "$record/started" "$base/started"
printf '%s\n' "$run" >"$base/current-run"
finish() {{
  code=$?
  date -u '+%Y-%m-%dT%H:%M:%SZ' >"$record/finished"
  printf '%s\n' "$code" >"$record/exit"
  cp "$record/output.log" "$base/output.log"
  cp "$record/finished" "$base/finished"
  count=0
  for name in $(LC_ALL=C ls -1t "$base/runs"); do
    case "$name" in legacy) ;; *[!0-9TZ-]*|'') continue ;; esac
    stale="$base/runs/$name"
    [ -d "$stale" ] && [ ! -L "$stale" ] || continue
    count=$((count + 1))
    if [ "$count" -gt 100 ] && [ "$name" != "$run" ]; then rm -rf -- "$stale"; fi
  done
  cp "$record/exit" "$base/exit"
  [ ! -f "$base/managed" ] || rmdir "$base/run.claim" 2>/dev/null
  trap - 0
  exit "$code"
}}
trap finish 0
cd {workdir} || exit 1
export PATH={path}
if [ -f "$base/managed" ]; then
  bridge_dir=$(dirname {cli})
  attempts=0
  while [ ! -s "$bridge_dir/.version" ] && [ "$attempts" -lt 30 ]; do
    sleep 0.1
    attempts=$((attempts + 1))
  done
  if [ -s "$bridge_dir/.version" ]; then
    export AGENT_HUB_CLI={cli}
  fi
fi
export AGENT_HUB_VARIABLES_JSON={variables}
export AGENT_HUB_SCRIPT_DIR={scripts_dir}
if [ -f "$base/managed" ]; then
  export AGENT_HUB_TASK_DIR={scripts_dir}
  export AGENT_HUB_STATE_DIR="$base/state"
  mkdir -p "$AGENT_HUB_STATE_DIR" || exit 1
  if [ -f "$base/python-path" ]; then
    AGENT_HUB_PYTHON=$(cat "$base/python-path")
    export AGENT_HUB_PYTHON
    export PATH="$(dirname "$AGENT_HUB_PYTHON"):$PATH"
  fi
fi
/bin/sh {payload}
"#,
        version = VERSION,
        variables = shell(variables),
        base = shell(&dir.to_string_lossy()),
        workdir = shell(workdir),
        scripts_dir = shell(scripts_dir),
        path =
            shell(&std::env::var("PATH").unwrap_or_else(|_| "/usr/local/bin:/usr/bin:/bin".into())),
        cli = shell(&cli.to_string_lossy()),
        payload = shell(&payload.to_string_lossy())
    )
}

pub(super) fn powershell_script(
    dir: &Path,
    workdir: &str,
    payload: &Path,
    scripts_dir: &str,
    variables: &str,
) -> String {
    let cli = crate::core::cli_bridge::bridge_path();
    format!(
        r#"{bom}# {version}
$ErrorActionPreference = 'Stop'
$base = {base}
$managed = Test-Path -LiteralPath (Join-Path $base 'managed')
$claim = Join-Path $base 'run.claim'
if ($managed) {{
  try {{ New-Item -ItemType Directory -Path $claim -ErrorAction Stop | Out-Null }} catch {{ exit 0 }}
  if (!(Test-Path -LiteralPath (Join-Path $base 'ready'))) {{ Remove-Item -LiteralPath $claim; exit 0 }}
}}
$runs = Join-Path $base 'runs'
[IO.Directory]::CreateDirectory($runs) | Out-Null
if (!(Test-Path -LiteralPath (Join-Path $base 'current-run')) -and (Test-Path -LiteralPath (Join-Path $base 'started'))) {{
  $legacy = Join-Path $runs 'legacy'
  [IO.Directory]::CreateDirectory($legacy) | Out-Null
  foreach ($file in @('started','finished','exit','output.log')) {{
    $old = Join-Path $base $file
    if (Test-Path -LiteralPath $old) {{ Copy-Item -LiteralPath $old -Destination (Join-Path $legacy $file) }}
  }}
}}
$run = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffffZ') + '-' + $PID
$record = Join-Path $runs $run
[IO.Directory]::CreateDirectory($record) | Out-Null
$log = Join-Path $record 'output.log'
foreach ($file in @('exit','finished')) {{ Remove-Item -LiteralPath (Join-Path $base $file) -ErrorAction SilentlyContinue }}
[IO.File]::WriteAllText((Join-Path $record 'started'), [DateTime]::UtcNow.ToString('o'))
Copy-Item -LiteralPath (Join-Path $record 'started') -Destination (Join-Path $base 'started')
[IO.File]::WriteAllText((Join-Path $base 'current-run'), $run)
$global:LASTEXITCODE = 0
$code = 0
try {{
  Set-Location -LiteralPath {workdir}
  $bridgeDir = Split-Path -Parent {cli}
  $attempts = 0
  while (!(Test-Path -LiteralPath (Join-Path $bridgeDir '.version')) -and $attempts -lt 30) {{
    Start-Sleep -Milliseconds 100
    $attempts++
  }}
  if (Test-Path -LiteralPath (Join-Path $bridgeDir '.version')) {{
    $env:AGENT_HUB_CLI = {cli}
  }}
  $env:AGENT_HUB_VARIABLES_JSON = {variables}
  $env:AGENT_HUB_SCRIPT_DIR = {scripts_dir}
  if ($managed) {{
    $env:AGENT_HUB_TASK_DIR = {scripts_dir}
    $env:AGENT_HUB_STATE_DIR = Join-Path $base 'state'
    [IO.Directory]::CreateDirectory($env:AGENT_HUB_STATE_DIR) | Out-Null
    $pythonPath = Join-Path $base 'python-path'
    if (Test-Path -LiteralPath $pythonPath) {{
      $env:AGENT_HUB_PYTHON = [IO.File]::ReadAllText($pythonPath).Trim()
      $env:PATH = (Split-Path $env:AGENT_HUB_PYTHON) + ';' + $env:PATH
    }}
  }}
  & {payload} *> $log
  if ($LASTEXITCODE) {{ $code = $LASTEXITCODE }}
}} catch {{ $_ | Out-File -LiteralPath $log -Append; $code = 1 }}
[IO.File]::WriteAllText((Join-Path $record 'finished'), [DateTime]::UtcNow.ToString('o'))
[IO.File]::WriteAllText((Join-Path $record 'exit'), [string]$code)
foreach ($file in @('finished','output.log')) {{
  Copy-Item -LiteralPath (Join-Path $record $file) -Destination (Join-Path $base $file)
}}
Get-ChildItem -LiteralPath $runs -Directory -Force | Where-Object {{
  !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -and ($_.Name -match '^(legacy|[0-9TZ-]+)$')
}} | Sort-Object LastWriteTimeUtc -Descending | Select-Object -Skip 100 | ForEach-Object {{
  if ($_.Name -ne $run) {{ Remove-Item -LiteralPath $_.FullName -Recurse -Force }}
}}
Copy-Item -LiteralPath (Join-Path $record 'exit') -Destination (Join-Path $base 'exit')
if ($managed) {{ Remove-Item -LiteralPath $claim -ErrorAction SilentlyContinue }}
exit $code
"#,
        bom = "\u{feff}",
        version = VERSION,
        variables = ps(variables),
        base = ps(&dir.to_string_lossy()),
        workdir = ps(workdir),
        cli = ps(&cli.to_string_lossy()),
        scripts_dir = ps(scripts_dir),
        payload = ps(&payload.to_string_lossy())
    )
}

#[cfg(all(test, unix))]
mod tests;
