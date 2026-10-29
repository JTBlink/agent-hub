use crate::core::automation::{Provider, Schedule};

#[test]
fn network_template_starts_paused_and_uses_a_restricted_entry_without_changing_networks() {
    let template = super::builtin::templates("zh", false, "sh")
        .into_iter()
        .find(|t| t.id == "network-reset")
        .unwrap();
    let mut draft = template.draft;
    draft.validate().unwrap();
    assert_eq!(draft.provider, Provider::System);
    assert!(!draft.enabled);
    assert_eq!(
        draft.schedule,
        Schedule::Daily {
            hour: 7,
            minute: 0,
            weekdays: false
        }
    );
    assert!(draft
        .files
        .iter()
        .all(|file| !file.path.ends_with("prompt.md")));
    assert!(!super::builtin::templates("en", false, "powershell")
        .iter()
        .any(|t| t.id == "network-reset"));
    let root = tempfile::tempdir().unwrap();
    for file in draft.files {
        let path = root.path().join(file.path);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, file.content).unwrap();
    }
    let result =
        std::process::Command::new(crate::core::automation::native::python_runtime().unwrap())
            .arg("-c")
            .arg(include_str!("fixtures/network_reset_checks.py"))
            .arg(root.path())
            .output()
            .unwrap();
    assert!(
        result.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}
