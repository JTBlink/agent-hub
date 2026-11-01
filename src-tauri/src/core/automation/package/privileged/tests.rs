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
