//! Standalone current-user runners persist bounded history without a running UI.
use super::render::{ps, shell};
use std::path::Path;
pub(super) const VERSION: &str = "AgentHub workspace scripts v5";

pub(super) fn shell_script(dir: &Path, workdir: &str, payload: &Path, scripts_dir: &str) -> String {
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
        base = shell(&dir.to_string_lossy()),
        workdir = shell(workdir),
        scripts_dir = shell(scripts_dir),
        path =
            shell(&std::env::var("PATH").unwrap_or_else(|_| "/usr/local/bin:/usr/bin:/bin".into())),
        payload = shell(&payload.to_string_lossy())
    )
}

pub(super) fn powershell_script(
    dir: &Path,
    workdir: &str,
    payload: &Path,
    scripts_dir: &str,
) -> String {
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
        base = ps(&dir.to_string_lossy()),
        workdir = ps(workdir),
        scripts_dir = ps(scripts_dir),
        payload = ps(&payload.to_string_lossy())
    )
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::core::automation::{AutomationDraft, Provider, Schedule};
    #[test]
    fn archives_legacy_output_and_preserves_independent_run_results() {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path().join("quoted ' directory");
        std::fs::create_dir(&dir).unwrap();
        for (name, value) in [
            ("started", "2026-10-26T01:00:00Z"),
            ("exit", "7"),
            ("output.log", "old failure"),
        ] {
            std::fs::write(dir.join(name), value).unwrap();
        }
        let mut draft = AutomationDraft {
            package_options: None,
            files: Vec::new(),
            name: "Audit".into(),
            provider: Provider::System,
            content: "printf 'first run'".into(),
            script_dir: None,
            workdir: Some(temp.path().to_string_lossy().into_owned()),
            schedule: Schedule::Manual,
            enabled: true,
        };
        for content in ["printf 'first run'", "printf 'second run'; exit 3"] {
            draft.content = content.into();
            let wrapper = super::super::render::scripts(
                &dir,
                &draft,
                "agent_hub:11111111-1111-4111-8111-111111111111",
                true,
            )
            .unwrap();
            let _ = std::process::Command::new("/bin/sh")
                .arg(wrapper)
                .status()
                .unwrap();
        }
        let records: Vec<_> = std::fs::read_dir(dir.join("runs"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect();
        assert_eq!(records.len(), 3);
        assert_eq!(
            std::fs::read_to_string(dir.join("runs/legacy/output.log")).unwrap(),
            "old failure"
        );
        let current = std::fs::read_to_string(dir.join("current-run")).unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join("runs").join(current.trim()).join("exit"))
                .unwrap()
                .trim(),
            "3"
        );
        assert!(records
            .iter()
            .any(|path| std::fs::read_to_string(path.join("output.log")).unwrap() == "first run"));
    }
    #[test]
    fn keeps_only_the_latest_hundred_owned_records_without_following_links() {
        let temp = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::create_dir(temp.path().join("runs")).unwrap();
        std::fs::write(outside.path().join("keep"), "keep").unwrap();
        std::os::unix::fs::symlink(
            outside.path(),
            temp.path().join("runs/20200101T000000Z-999"),
        )
        .unwrap();
        for number in 0..102 {
            std::fs::create_dir(temp.path().join(format!("runs/20200101T000000Z-{number}")))
                .unwrap();
        }
        let payload = temp.path().join("command.sh");
        std::fs::write(&payload, "exit 0").unwrap();
        let wrapper = temp.path().join("run.sh");
        std::fs::write(
            &wrapper,
            shell_script(
                temp.path(),
                &temp.path().to_string_lossy(),
                &payload,
                &temp.path().to_string_lossy(),
            ),
        )
        .unwrap();
        assert!(std::process::Command::new("/bin/sh")
            .arg(wrapper)
            .status()
            .unwrap()
            .success());
        let count = std::fs::read_dir(temp.path().join("runs"))
            .unwrap()
            .filter(|entry| entry.as_ref().unwrap().file_type().unwrap().is_dir())
            .count();
        assert_eq!(count, 100);
        assert!(outside.path().join("keep").is_file());
    }
}
