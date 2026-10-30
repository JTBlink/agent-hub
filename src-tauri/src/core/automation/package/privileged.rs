//! One supported administrator action, built from embedded trusted code. Imported
//! install/uninstall scripts are never executed as lifecycle hooks.
use super::*;
use base64::Engine;

const NETWORK_ENTRY: &str =
    include_str!("../templates/builtin/network-reset/scripts/network-reset.py");
const RESET: &str = include_str!("../templates/builtin/network-reset/scripts/reset.sh");

fn supported(record: &ManagedAutomation) -> bool {
    record
        .draft
        .files
        .iter()
        .any(|file| file.path == "scripts/network-reset.py" && file.content == NETWORK_ENTRY)
}

fn locations(id: &str) -> Result<(String, String), String> {
    if !valid_id(id) {
        return Err("Invalid privileged task instance".into());
    }
    let uuid = id.trim_start_matches("agent_hub:");
    Ok((
        format!("/Library/PrivilegedHelperTools/agent-hub-network-reset/{uuid}"),
        format!("/etc/sudoers.d/agent-hub-network-reset-{uuid}"),
    ))
}

pub(super) fn prepare(record: &ManagedAutomation) -> Result<(), String> {
    if !supported(record) {
        return Ok(());
    }
    if !cfg!(target_os = "macos") {
        return Err("Network reset installation requires macOS".into());
    }
    let path = directory(record).ok_or("Missing network task package")?;
    let (target, sudoers) = locations(&record.id)?;
    let receipt = path.join(".local/privileged.json");
    if receipt.exists() && Path::new(&target).join("owner").is_file() {
        let id =
            std::fs::read_to_string(Path::new(&target).join("owner")).map_err(|e| e.to_string())?;
        if id.trim() == record.id && Path::new(&sudoers).is_file() {
            return Ok(());
        }
    }
    let user = super::super::process::read_command("/usr/bin/id", &["-un"])?;
    let user = user.trim();
    if user.is_empty()
        || !user
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c))
    {
        return Err("Cannot resolve the current user for network reset installation".into());
    }
    // Persist exact ownership before the system authorization dialog.
    json_write(&receipt, &record.id)?;
    authorize(&install_script(&record.id, user, &target, &sudoers))
}

fn install_script(id: &str, user: &str, target: &str, sudoers: &str) -> String {
    let encoded = base64::engine::general_purpose::STANDARD.encode(RESET);
    format!(
        r#"set -euo pipefail
umask 077
target='{target}'
sudoers='{sudoers}'
for path in /Library/PrivilegedHelperTools /Library/PrivilegedHelperTools/agent-hub-network-reset "$target" "$target/owner" "$target/run" "$target/reset.sh" /etc/sudoers.d "$sudoers"; do
  [[ ! -L "$path" ]] || {{ echo 'Network helper paths cannot be links' >&2; exit 1; }}
done
if [[ -e "$target" ]]; then
  [[ -f "$target/owner" && "$(cat "$target/owner")" == '{id}' ]] || {{ echo 'Network helper is not owned by this task' >&2; exit 1; }}
fi
temporary="$(/usr/bin/mktemp -d /private/tmp/agent-hub-network.XXXXXX)"
trap '/bin/rm -rf "$temporary"' EXIT
printf '%s' '{encoded}' | /usr/bin/base64 -D > "$temporary/reset.sh"
printf '#!/bin/bash\nset -euo pipefail\n[[ "$#" -eq 0 ]] || exit 64\nexec /usr/bin/env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin /bin/bash {target}/reset.sh Ethernet 5\n' > "$temporary/run"
printf '%s ALL=(root) NOPASSWD: {target}/run ""\n' '{user}' > "$temporary/sudoers"
/usr/sbin/visudo -cf "$temporary/sudoers" >/dev/null
/usr/bin/install -d -o root -g wheel -m 755 /Library/PrivilegedHelperTools/agent-hub-network-reset "$target" /etc/sudoers.d
printf '%s\n' '{id}' > "$temporary/owner"
/usr/bin/install -o root -g wheel -m 644 "$temporary/owner" "$target/owner"
/usr/bin/install -o root -g wheel -m 755 "$temporary/reset.sh" "$target/reset.sh"
/usr/bin/install -o root -g wheel -m 755 "$temporary/run" "$target/run"
/usr/bin/install -o root -g wheel -m 440 "$temporary/sudoers" "$sudoers"
"#
    )
}

pub(super) fn cleanup(record: &ManagedAutomation) -> Result<(), String> {
    let path = directory(record).ok_or("Missing task package")?;
    let receipt = path.join(".local/privileged.json");
    if !receipt.exists() {
        return Ok(());
    }
    let owner: String = super::storage::json(&receipt)?;
    if owner != record.id {
        return Err("Privileged resource receipt changed; resources were preserved".into());
    }
    let (target, sudoers) = locations(&record.id)?;
    let script = format!(
        r#"set -euo pipefail
target='{target}'
sudoers='{sudoers}'
for path in /Library/PrivilegedHelperTools/agent-hub-network-reset "$target" "$target/owner" "$target/run" "$target/reset.sh" /etc/sudoers.d "$sudoers"; do
  [[ ! -L "$path" ]] || {{ echo 'Network helper paths cannot be links' >&2; exit 1; }}
done
if [[ -e "$target" ]]; then
  [[ -f "$target/owner" && "$(cat "$target/owner")" == '{id}' ]] || {{ echo 'Network helper ownership changed' >&2; exit 1; }}
  for entry in "$target"/* "$target"/.[!.]*; do
    [[ -e "$entry" ]] || continue
    case "$entry" in "$target/owner"|"$target/run"|"$target/reset.sh") ;; *) echo 'Network helper has additional files; resources were preserved' >&2; exit 1 ;; esac
  done
  /bin/rm -f "$sudoers" "$target/run" "$target/reset.sh" "$target/owner"
  /bin/rmdir "$target"
elif [[ -e "$sudoers" ]]; then
  echo 'Network helper has no ownership marker; resources were preserved' >&2; exit 1
fi
"#,
        id = record.id
    );
    authorize(&script)?;
    std::fs::remove_file(receipt).map_err(|e| e.to_string())
}

fn authorize(script: &str) -> Result<(), String> {
    if !cfg!(target_os = "macos") {
        return Err("Administrator setup requires macOS".into());
    }
    let shell = format!("/bin/bash -c '{}'", script.replace('\'', "'\\''"));
    let apple = format!(
        "do shell script \"{}\" with administrator privileges",
        shell
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
    );
    super::super::process::command_with_timeout("/usr/bin/osascript", &["-e", &apple], &[], 300)
        .map(|_| ())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn privileged_installation_is_namespaced_inert_and_shell_valid() {
        let id = "agent_hub:11111111-1111-4111-8111-111111111111";
        let (target, sudoers) = locations(id).unwrap();
        let script = install_script(id, "demo", &target, &sudoers);
        let mut child = std::process::Command::new("/bin/bash")
            .arg("-n")
            .stdin(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        use std::io::Write;
        child
            .stdin
            .take()
            .unwrap()
            .write_all(script.as_bytes())
            .unwrap();
        assert!(child.wait().unwrap().success());
        assert!(!script.contains("-setnetworkserviceenabled"));
        assert!(script.contains(&sudoers));
        assert!(locations("../../other").is_err());
    }
}
