use super::{cli, success, Cleanup};
use serde_json::json;
use std::path::PathBuf;

#[test]
#[ignore = "Creates and removes isolated manual-only native tasks; run explicitly on a desktop host"]
fn copies_all_task_files_and_allows_independent_edits_without_running_either_task() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("runtime");
    let input = temp.path().join("task.json");
    let draft = json!({
        "name": "Copy smoke source", "provider": "system", "content": "echo copy-smoke",
        "workdir": null, "schedule": {"kind":"manual"}, "enabled": true,
        "files": [
            {"path":"prompts/prompt.md", "content":"Review selected requests"},
            {"path":"config/settings.json", "content":"{\"limit\":3}"}
        ]
    });
    std::fs::write(&input, draft.to_string()).unwrap();
    let created = success(cli(&root, &["create", "--file", input.to_str().unwrap()]));
    let source = Cleanup {
        root: &root,
        id: created["id"].as_str().unwrap().into(),
    };
    let original = success(cli(&root, &["show", &source.id]));
    let source_path = PathBuf::from(original["definition"]["script_dir"].as_str().unwrap());
    std::fs::create_dir_all(source_path.join(".local/state")).unwrap();
    std::fs::write(
        source_path.join(".local/state/task-state.json"),
        "private state",
    )
    .unwrap();
    let copied = success(cli(
        &root,
        &["copy", &source.id, "--name", "Copy smoke result"],
    ));
    let copy = Cleanup {
        root: &root,
        id: copied["id"].as_str().unwrap().into(),
    };
    let task = success(cli(&root, &["show", &copy.id]));
    assert_ne!(source.id, copy.id);
    let copy_path = PathBuf::from(task["definition"]["script_dir"].as_str().unwrap());
    assert_ne!(source_path, copy_path);
    assert_eq!(task["definition"]["files"], original["definition"]["files"]);
    assert_eq!(task["definition"]["enabled"], false);
    assert!(!copy_path.join(".local/state/task-state.json").exists());
    assert!(!copy_path.join(".local/started").exists());
    assert!(!source_path.join(".local/started").exists());
    let mut changed = task["definition"].clone();
    changed["name"] = json!("Edited copy");
    for file in changed["files"].as_array_mut().unwrap() {
        if file["path"] == "prompts/prompt.md" {
            file["content"] = json!("Updated review instructions");
        }
        if file["path"] == "config/settings.json" {
            file["content"] = json!("{\"limit\":5}");
        }
    }
    std::fs::write(&input, changed.to_string()).unwrap();
    success(cli(
        &root,
        &[
            "edit",
            &copy.id,
            "--file",
            input.to_str().unwrap(),
            "--revision",
            &task["revision"].to_string(),
        ],
    ));
    assert_eq!(
        std::fs::read_to_string(copy_path.join("prompts/prompt.md")).unwrap(),
        "Updated review instructions"
    );
    assert_eq!(
        std::fs::read_to_string(copy_path.join("config/settings.json")).unwrap(),
        "{\"limit\":5}"
    );
    assert_eq!(
        std::fs::read_to_string(source_path.join("prompts/prompt.md")).unwrap(),
        "Review selected requests"
    );
    assert!(!copy_path.join(".local/started").exists());
}
