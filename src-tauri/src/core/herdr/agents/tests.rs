use super::*;

struct ConfigEnv {
    _guard: std::sync::MutexGuard<'static, ()>,
    _root: tempfile::TempDir,
}
impl Drop for ConfigEnv {
    fn drop(&mut self) {
        crate::core::central_repo::set_test_base_dir_override(None);
    }
}
fn config_env() -> ConfigEnv {
    let guard = crate::core::central_repo::test_base_dir_lock();
    let root = tempfile::tempdir().unwrap();
    crate::core::central_repo::set_test_base_dir_override(Some(root.path().to_path_buf()));
    ConfigEnv {
        _guard: guard,
        _root: root,
    }
}

#[test]
fn rejects_unknown_agent_kinds() {
    assert!(serde_json::from_str::<HerdrAgent>("\"shell\"").is_err());
}

#[test]
fn removes_inherited_session_routing() {
    let client = Client {
        executable: Path::new("herdr"),
        cwd: Path::new("."),
    };
    let command = client.command();
    for name in [
        "HERDR_SOCKET_PATH",
        "HERDR_PANE_ID",
        "HERDR_ENV",
        "CLAUDECODE",
        "CODEX_THREAD_ID",
        "CODEX_SESSION_ID",
        "CODEX_TOOL_CALL_ID",
    ] {
        assert!(command
            .get_envs()
            .any(|(key, value)| key == name && value.is_none()));
    }
}

#[cfg(unix)]
fn fake_herdr(mode: &str) -> (tempfile::TempDir, PathBuf) {
    use std::os::unix::fs::PermissionsExt;
    let directory = tempfile::tempdir().unwrap();
    let executable = directory.path().join("herdr");
    let script = format!(
        r##"#!/bin/sh
printf '%s\n' "$@" >> "$0.log"
case "$3 $4" in
  'session list') printf '%s' '{{"sessions":[{{"name":"default","running":true}}]}}' ;;
  'workspace create') printf '%s' '{{"ok":true,"result":{{"root_pane":{{"pane_id":"w9:p3","terminal_id":"term_demo"}}}}}}' ;;
  'agent start')
    if [ '{mode}' != 'ready' ]; then printf '%s' 'agent_not_ready' >&2; exit 1; fi
    printf '%s' '{{"ok":true,"result":{{}}}}' ;;
  'agent get')
    if [ '{mode}' = 'unknown' ]; then printf '%s' 'agent_not_found' >&2; exit 1; fi
    printf '%s' '{{"ok":true,"result":{{"agent":{{"agent_status":"blocked"}}}}}}' ;;
  *) exit 2 ;;
esac
"##
    );
    std::fs::write(&executable, script).unwrap();
    std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
    (directory, executable)
}

#[cfg(unix)]
#[test]
fn starts_each_yolo_agent_in_an_explicit_workspace_and_attaches_only_its_identity() {
    let _config = config_env();
    for (agent, expected) in [
        (
            HerdrAgent::Codex,
            "--dangerously-bypass-approvals-and-sandbox",
        ),
        (HerdrAgent::Claude, "--dangerously-skip-permissions"),
        (HerdrAgent::ClaudeTeams, "--dangerously-skip-permissions"),
        (HerdrAgent::Opencode, "--auto"),
        (HerdrAgent::Hermes, "--yolo"),
    ] {
        let (directory, executable) = fake_herdr("ready");
        let prepared = prepare_available(&executable, directory.path(), agent).unwrap();
        let attachment = prepared.attachment;
        prepared.startup.start().unwrap();
        let log = std::fs::read_to_string(executable.with_extension("log")).unwrap();
        assert!(log.contains(&format!("\n--cwd\n{}\n", directory.path().display())));
        assert!(log.contains("\n--no-focus\n"));
        assert!(log.contains("\n--pane\nw9:p3\n--timeout\n30000\n--\n"));
        assert!(log.contains(expected));
        assert_eq!(log.matches("\nstart\n").count(), 1);
        assert_eq!(
            attachment.arguments[..4],
            ["--session", "default", "terminal", "attach"]
        );
        assert_eq!(attachment.arguments[4], "term_demo");
        assert_eq!(
            log.contains("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1"),
            matches!(agent, HerdrAgent::ClaudeTeams)
        );
        assert!(!log.contains("\nfocus\n"));
    }
}

#[cfg(unix)]
#[test]
fn attaches_to_startup_dialogs_without_restarting_the_agent() {
    let _config = config_env();
    let (directory, executable) = fake_herdr("blocked");
    prepare_available(&executable, directory.path(), HerdrAgent::Claude)
        .unwrap()
        .startup
        .start()
        .unwrap();
    let log = std::fs::read_to_string(executable.with_extension("log")).unwrap();
    assert_eq!(log.matches("\nstart\n").count(), 1);
    assert!(log.contains("\nget\n"));
    assert!(!log.contains("\nclose\n"));
}

#[cfg(unix)]
#[test]
fn preserves_unknown_startup_results_for_inspection_without_repeating_launch() {
    let _config = config_env();
    let (directory, executable) = fake_herdr("unknown");
    let error = prepare_available(&executable, directory.path(), HerdrAgent::Codex)
        .unwrap()
        .startup
        .start()
        .unwrap_err();
    assert!(error.to_string().contains("see its terminal output"));
    let log = std::fs::read_to_string(executable.with_extension("log")).unwrap();
    assert_eq!(log.matches("\nstart\n").count(), 1);
    assert!(!log.contains("\nclose\n"));
}

#[cfg(unix)]
#[test]
fn exposes_the_herdr_terminal_before_waiting_for_agent_readiness() {
    let _config = config_env();
    let (directory, executable) = fake_herdr("ready");
    let prepared = prepare_available(&executable, directory.path(), HerdrAgent::Codex).unwrap();
    let log = std::fs::read_to_string(executable.with_extension("log")).unwrap();
    assert!(
        !log.contains("\nstart\n"),
        "Agent startup must not hide its terminal behind a readiness wait"
    );
    assert_eq!(
        prepared.attachment.arguments,
        ["--session", "default", "terminal", "attach", "term_demo"]
    );
}

#[cfg(unix)]
#[test]
fn starts_a_configured_executable_path_without_replacing_it_with_the_canonical_binary() {
    use std::os::unix::fs::PermissionsExt;
    let _config = config_env();
    let (directory, executable) = fake_herdr("ready");
    let program = directory.path().join("codex wrapper");
    std::fs::write(&program, "#!/bin/sh\nexit 0\n").unwrap();
    std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o700)).unwrap();
    let mut script = std::fs::read_to_string(&executable).unwrap();
    script = script.replace("  *) exit 2 ;;", r#"  'pane process-info') printf '%s' '{"process_info":{"shell_pid":7,"foreground_processes":[{"pid":7,"name":"zsh"}]}}' ;;
  'pane run'|'agent rename'|'agent wait') printf '%s' '{"result":{}}' ;;
  *) exit 2 ;;"#);
    script = script.replace(
        "\"agent_status\":\"blocked\"",
        "\"agent_status\":\"idle\",\"agent\":\"codex\"",
    );
    std::fs::write(&executable, script).unwrap();
    let initial = crate::core::agent_launch_config::load().unwrap();
    let mut document = initial.document;
    document.instructions.insert(
        "codex".into(),
        format!(
            "'{}' --search --literal '$(touch NEVER)'",
            program.display()
        ),
    );
    crate::core::agent_launch_config::save(document, &initial.revision).unwrap();
    let prepared = prepare(&executable, directory.path(), HerdrAgent::Codex).unwrap();
    prepared.startup.start().unwrap();
    let log = std::fs::read_to_string(executable.with_extension("log")).unwrap();
    assert!(log.contains(&format!(
        "'{}' '--search' '--literal' '$(touch NEVER)'",
        program.display()
    )));
    assert_eq!(log.matches("\nrun\n").count(), 1);
    assert!(!log.contains("\nstart\n"));
    assert!(!directory.path().join("NEVER").exists());
}
