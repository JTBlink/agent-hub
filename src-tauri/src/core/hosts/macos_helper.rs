//! A root-owned, fixed Hosts writer. Only its argument-free entry is allowed by
//! sudoers; requests arrive as data on stdin. No application binary runs as root.
use crate::core::{cli_process, system_authorization::authorize};
use std::{
    io::{Seek, SeekFrom, Write},
    os::unix::fs::MetadataExt,
    path::Path,
    process::Command,
};

const ROOT: &str = "/Library/PrivilegedHelperTools/agent-hub-hosts-v1";
const WRITER: &str = include_str!("macos_helper/write.sh");
const ENTRY: &str = "#!/bin/sh\numask 077\nexec /usr/bin/env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin /usr/bin/lockf -k -t 0 /private/etc/agent-hub-hosts.lock /bin/bash /Library/PrivilegedHelperTools/agent-hub-hosts-v1/write.sh\n";

fn identity() -> Result<(String, String), String> {
    let user = cli_process::read_command("/usr/bin/id", &["-un"])?;
    let user = user.trim();
    if user.is_empty()
        || !user
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c))
    {
        return Err("Cannot resolve the current user for Hosts authorization".into());
    }
    Ok((
        user.to_string(),
        format!("/private/etc/sudoers.d/agent-hub-hosts-{}", unsafe {
            libc::getuid()
        }),
    ))
}

fn trusted(path: &Path) -> bool {
    std::fs::symlink_metadata(path)
        .is_ok_and(|m| !m.file_type().is_symlink() && m.uid() == 0 && m.mode() & 0o022 == 0)
}

fn installed(sudoers: &str) -> bool {
    ["/Library", "/Library/PrivilegedHelperTools", ROOT, "/private", "/private/etc", "/private/etc/sudoers.d", sudoers]
        .iter().all(|path| trusted(Path::new(path)))
        && [ ("run", ENTRY), ("write.sh", WRITER) ].iter().all(|(name, expected)| {
            let path = Path::new(ROOT).join(name);
            trusted(&path) && std::fs::read_to_string(path).is_ok_and(|actual| actual == *expected)
        })
        // sudoers is deliberately unreadable to the application. Ask sudo to
        // check the exact entry without executing it or displaying a prompt.
        && cli_process::command("/usr/bin/sudo", &["-n", "-l", "--", &format!("{ROOT}/run")], &[]).is_ok()
}

fn rule(user: &str) -> String {
    format!("{user} ALL=(root) NOPASSWD: {ROOT}/run \"\"\n")
}

fn path_checks(sudoers: &str) -> String {
    // Check all ancestors before creating or replacing anything. A user-writable
    // helper directory must never become an authorized root executable.
    format!(
        r#"for path in /Library /Library/PrivilegedHelperTools '{ROOT}' '{ROOT}/run' '{ROOT}/write.sh' /private /private/etc /private/etc/sudoers.d '{sudoers}'; do
  [[ ! -L "$path" ]] || exit 1
  if [[ -e "$path" ]]; then
    [[ "$(/usr/bin/stat -f %u "$path")" == 0 ]] || exit 1
    mode=$(/usr/bin/stat -f %Lp "$path")
    (( (8#$mode & 8#022) == 0 )) || exit 1
  fi
done
"#
    )
}

fn install_script(sudoers: &str, rule: &str) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let writer = STANDARD.encode(WRITER);
    let entry = STANDARD.encode(ENTRY);
    let rule = STANDARD.encode(rule);
    format!(
        r#"set -euo pipefail
umask 077
{checks}
temporary=$(/usr/bin/mktemp -d /private/tmp/agent-hub-hosts-setup.XXXXXX)
trap '/bin/rm -rf "$temporary"' EXIT
printf '%s' '{writer}' | /usr/bin/base64 -D > "$temporary/write.sh"
printf '%s' '{entry}' | /usr/bin/base64 -D > "$temporary/run"
printf '%s' '{rule}' | /usr/bin/base64 -D > "$temporary/sudoers"
/usr/sbin/visudo -cf "$temporary/sudoers" >/dev/null
/usr/bin/install -d -o root -g wheel -m 755 '{ROOT}' /private/etc/sudoers.d
/bin/chmod 644 "$temporary/write.sh"
/bin/chmod 755 "$temporary/run"
/bin/chmod 440 "$temporary/sudoers"
/usr/sbin/chown root:wheel "$temporary/write.sh" "$temporary/run" "$temporary/sudoers"
/bin/mv -f "$temporary/write.sh" '{ROOT}/write.sh'
/bin/mv -f "$temporary/run" '{ROOT}/run'
/bin/mv -f "$temporary/sudoers" '{sudoers}'
"#,
        checks = path_checks(sudoers)
    )
}

pub(super) fn write(
    target: &Path,
    source: &Path,
    expected: &str,
    updated: &str,
    backup: &Path,
) -> Result<(), String> {
    if target != Path::new("/private/etc/hosts") {
        return Err("HOSTS_INVALID_TARGET".into());
    }
    let token = backup
        .file_name()
        .and_then(|n| n.to_str())
        .and_then(|n| n.strip_prefix("hosts.agent-hub-"))
        .and_then(|n| n.strip_suffix(".bak"))
        .ok_or("HOSTS_INVALID_TARGET")?;
    uuid::Uuid::parse_str(token).map_err(|_| "HOSTS_INVALID_TARGET")?;
    let (user, sudoers) = identity()?;
    let rule = rule(&user);
    if !installed(&sudoers) {
        authorize(&install_script(&sudoers, &rule))?;
    }
    // Do not retry a failed write with another prompt; conflicts and permission
    // failures must retain their actual error and leave the editor draft intact.
    let mut input = tempfile::tempfile().map_err(|e| e.to_string())?;
    writeln!(input, "{expected}\n{updated}\n{token}").map_err(|e| e.to_string())?;
    let mut source = std::fs::File::open(source).map_err(|e| e.to_string())?;
    std::io::copy(&mut source, &mut input).map_err(|e| e.to_string())?;
    input.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    let mut command = Command::new("/usr/bin/sudo");
    command.args(["-n", "--", &format!("{ROOT}/run")]);
    cli_process::capture_prepared_with_input(command, "Hosts helper", 30, None, Some(input))
        .map(|_| ())
}

/// Revoke this user's persistent Hosts permission; other users and backups remain.
/// The next protected write will request administrator authorization again.
pub fn revoke() -> Result<(), String> {
    let (_, sudoers) = identity()?;
    if !Path::new(&sudoers)
        .try_exists()
        .map_err(|e| e.to_string())?
    {
        return Ok(());
    }
    authorize(&format!(
        "set -euo pipefail\n{}\n/bin/rm -f '{}'\n",
        path_checks(&sudoers),
        sudoers
    ))
}

#[cfg(test)]
mod tests;
