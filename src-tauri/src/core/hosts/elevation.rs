//! Execute embedded code only; hosts contents are data, never shell source.
use std::path::Path;

pub(super) fn write(
    target: &Path,
    source: &Path,
    expected: &str,
    updated: &str,
    backup: &Path,
) -> Result<(), String> {
    let elevated = match std::fs::OpenOptions::new().write(true).open(target) {
        Ok(_) => false,
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => true,
        Err(e) => return Err(e.to_string()),
    };
    #[cfg(target_os = "macos")]
    if elevated {
        return super::macos_helper::write(target, source, expected, updated, backup);
    }
    let script = script(target, source, expected, updated, backup);
    run(&script, elevated)
}

#[cfg(unix)]
fn quote(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"))
}

#[cfg(unix)]
pub(super) fn script(
    target: &Path,
    source: &Path,
    expected: &str,
    updated: &str,
    backup: &Path,
) -> String {
    let hash = if cfg!(target_os = "macos") {
        "/usr/bin/shasum -a 256"
    } else {
        "/usr/bin/sha256sum"
    };
    format!(
        r#"set -eu
target={target}
source={source}
backup={backup}
[ -f "$target" ] && [ ! -L "$target" ] || {{ echo HOSTS_INVALID_TARGET >&2; exit 1; }}
temporary=$(/usr/bin/mktemp -d /tmp/agent-hub-hosts.XXXXXX)
trap '/bin/rm -rf "$temporary"' EXIT
umask 077
/bin/cat "$source" > "$temporary/content"
digest() {{ {hash} "$1" | /usr/bin/awk '{{print $1}}'; }}
[ "$(digest "$temporary/content")" = '{updated}' ] || {{ echo HOSTS_PAYLOAD_CHANGED >&2; exit 1; }}
[ "$(digest "$target")" = '{expected}' ] || {{ echo HOSTS_CONFLICT >&2; exit 1; }}
[ ! -e "$backup" ] && [ ! -L "$backup" ] || exit 1
/bin/cp -p "$target" "$backup"
if ! /bin/cat "$temporary/content" > "$target" || [ "$(digest "$target")" != '{updated}' ]; then
  /bin/cat "$backup" > "$target" || {{ echo HOSTS_RESTORE_FAILED >&2; exit 1; }}
  echo HOSTS_WRITE_FAILED >&2; exit 1
fi
"#,
        target = quote(target),
        source = quote(source),
        backup = quote(backup)
    )
}

#[cfg(unix)]
fn run(script: &str, elevated: bool) -> Result<(), String> {
    use crate::core::cli_process::command_with_timeout;
    if !elevated {
        return command_with_timeout("/bin/sh", &["-c", script], &[], 300).map(|_| ());
    }
    #[cfg(target_os = "macos")]
    {
        crate::core::system_authorization::authorize(script)
    }
    #[cfg(not(target_os = "macos"))]
    {
        command_with_timeout("pkexec", &["/bin/sh", "-c", script], &[], 300).map(|_| ())
    }
}

#[cfg(windows)]
fn quote(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', "''"))
}

#[cfg(windows)]
pub(super) fn script(
    target: &Path,
    source: &Path,
    expected: &str,
    updated: &str,
    backup: &Path,
) -> String {
    format!(
        r#"$ErrorActionPreference = 'Stop'
function Get-ContentHash([string]$path) {{
  $stream = [IO.File]::OpenRead($path)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {{ return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }}
  finally {{ $sha.Dispose(); $stream.Dispose() }}
}}
try {{
  $target = {target}
  $backup = {backup}
  if ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint) {{ throw 'HOSTS_INVALID_TARGET' }}
  $bytes = [IO.File]::ReadAllBytes({source})
  $sha = [Security.Cryptography.SHA256]::Create()
  try {{ $hash = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant() }} finally {{ $sha.Dispose() }}
  if ($hash -ne '{updated}') {{ throw 'HOSTS_PAYLOAD_CHANGED' }}
  if ((Get-ContentHash $target) -ne '{expected}') {{ throw 'HOSTS_CONFLICT' }}
  [IO.File]::Copy($target, $backup, $false)
  try {{
    [IO.File]::WriteAllBytes($target, $bytes)
    if ((Get-ContentHash $target) -ne '{updated}') {{ throw 'HOSTS_VERIFY_FAILED' }}
  }} catch {{
    try {{ [IO.File]::WriteAllBytes($target, [IO.File]::ReadAllBytes($backup)) }} catch {{ throw 'HOSTS_RESTORE_FAILED' }}
    throw 'HOSTS_WRITE_FAILED'
  }}
  exit 0
}} catch {{ [Console]::Error.WriteLine($_); exit 1 }}
"#,
        target = quote(target),
        source = quote(source),
        backup = quote(backup)
    )
}

#[cfg(windows)]
fn run(script: &str, elevated: bool) -> Result<(), String> {
    use crate::core::cli_process::capture_prepared;
    use base64::{engine::general_purpose::STANDARD, Engine};
    let encode = |value: &str| {
        STANDARD.encode(
            value
                .encode_utf16()
                .flat_map(u16::to_le_bytes)
                .collect::<Vec<_>>(),
        )
    };
    let powershell = std::env::var_os("SystemRoot")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| "C:\\Windows".into())
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let inner = encode(script);
    let launcher = if elevated {
        // ExitCode propagates failures even though the UAC child has its own console.
        format!("$ErrorActionPreference='Stop'; try {{ $p = Start-Process -FilePath {} -Verb RunAs -ArgumentList '-NoProfile -NonInteractive -EncodedCommand {inner}' -Wait -PassThru; exit $p.ExitCode }} catch {{ [Console]::Error.WriteLine($_); exit 1 }}", quote(&powershell))
    } else {
        script.into()
    };
    let mut command = std::process::Command::new(&powershell);
    command.args([
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        &encode(&launcher),
    ]);
    // PowerShell 7's inherited module path is incompatible with Windows PowerShell 5.
    command.env_remove("PSModulePath");
    capture_prepared(command, &powershell.to_string_lossy(), 300, None).map(|_| ())
}
