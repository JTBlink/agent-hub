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
        std::fs::create_dir(temp.path().join(format!("runs/20200101T000000Z-{number}"))).unwrap();
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
