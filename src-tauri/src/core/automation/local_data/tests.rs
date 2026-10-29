use super::*;
use crate::core::automation::{AutomationDraft, Schedule};

pub(crate) struct Fixture {
    _temp: tempfile::TempDir,
    pub state: PathBuf,
    pub root: PathBuf,
    pub workspace: PathBuf,
    pub record: ManagedAutomation,
}
impl Fixture {
    pub fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let state = temp.path().join("state");
        let root = temp.path().join("automations");
        let workspace = root.join("Audit");
        fs::create_dir_all(&workspace).unwrap();
        let id = format!("agent_hub:{}", uuid::Uuid::new_v4());
        let runtime = state.join(id.trim_start_matches("agent_hub:"));
        fs::create_dir_all(runtime.join("runs/example")).unwrap();
        fs::write(runtime.join("runs/example/output.log"), "execution").unwrap();
        fs::write(runtime.join("workspace-name.json"), "\"Audit\"").unwrap();
        fs::write(workspace.join("run.sh"), "exit 0").unwrap();
        fs::write(workspace.join("result.txt"), "task output").unwrap();
        let mut record = ManagedAutomation {
            id,
            revision: 1,
            draft: AutomationDraft {
                name: "Audit".into(),
                provider: Provider::System,
                content: "exit 0".into(),
                workdir: Some(workspace.to_string_lossy().into_owned()),
                schedule: Schedule::Manual,
                enabled: false,
                files: Vec::new(),
            },
            source: native::source().into(),
            identifier: String::new(),
            location: String::new(),
        };
        let (identifier, location) = native::paths(&state, &record).unwrap();
        record.identifier = identifier;
        record.location = location.to_string_lossy().into_owned();
        Self {
            _temp: temp,
            state,
            root,
            workspace,
            record,
        }
    }
    fn plan(&self, records: &[ManagedAutomation]) -> Result<Cleanup, String> {
        Cleanup::plan(&self.state, &self.root, &self.record, records)
    }
}

#[test]
fn removes_assigned_workspace_and_runtime_without_guessing_other_folder_names() {
    let case = Fixture::new();
    let unrelated = case.root.join("Audit-2");
    fs::create_dir(&unrelated).unwrap();
    fs::write(unrelated.join("keep.txt"), "keep").unwrap();
    case.plan(std::slice::from_ref(&case.record))
        .unwrap()
        .remove()
        .unwrap();
    assert!(!case.workspace.exists());
    assert!(!native::directory(&case.state, &case.record).exists());
    assert!(unrelated.join("keep.txt").is_file());
    assert!(case.root.is_dir());
}

#[test]
fn exact_legacy_uuid_workspace_removes_its_parent_folder() {
    let mut case = Fixture::new();
    fs::remove_file(native::directory(&case.state, &case.record).join("workspace-name.json"))
        .unwrap();
    let legacy = case
        .root
        .join(case.record.id.trim_start_matches("agent_hub:"));
    fs::create_dir_all(legacy.join("workspace")).unwrap();
    fs::write(legacy.join("workspace/output.txt"), "output").unwrap();
    fs::write(legacy.join("old-run.sh"), "command").unwrap();
    case.record.draft.workdir = Some(legacy.join("workspace").to_string_lossy().into_owned());
    case.plan(std::slice::from_ref(&case.record))
        .unwrap()
        .remove()
        .unwrap();
    assert!(!legacy.exists());
    assert!(case.workspace.is_dir(), "unassigned names are not adopted");
}

#[test]
fn custom_workspace_is_kept_while_its_previously_assigned_workspace_is_cleaned() {
    let mut case = Fixture::new();
    let custom = case.root.join("custom-project");
    fs::create_dir(&custom).unwrap();
    fs::write(custom.join("run.sh"), "user script").unwrap();
    case.record.draft.workdir = Some(custom.to_string_lossy().into_owned());
    case.plan(std::slice::from_ref(&case.record))
        .unwrap()
        .remove()
        .unwrap();
    assert!(custom.join("run.sh").is_file());
    assert!(!case.workspace.exists());
}

#[test]
fn another_task_using_an_owned_workspace_or_child_prevents_directory_cleanup() {
    for nested in [false, true] {
        let case = Fixture::new();
        let mut other = case.record.clone();
        other.id = format!("agent_hub:{}", uuid::Uuid::new_v4());
        other.draft.workdir = Some(
            if nested {
                case.workspace.join("child")
            } else {
                case.workspace.clone()
            }
            .to_string_lossy()
            .into_owned(),
        );
        case.plan(&[case.record.clone(), other])
            .unwrap()
            .remove()
            .unwrap();
        assert!(case.workspace.join("result.txt").is_file());
        assert!(!native::directory(&case.state, &case.record).exists());
    }
}

#[test]
fn external_scheduler_workspace_references_are_preserved() {
    let case = Fixture::new();
    case.plan(std::slice::from_ref(&case.record))
        .unwrap()
        .protect_workspaces(std::iter::once(case.workspace.join("child")))
        .remove()
        .unwrap();
    assert!(case.workspace.join("result.txt").exists());
    assert!(!native::directory(&case.state, &case.record).exists());
}

#[test]
fn custom_workspace_inside_internal_runtime_is_also_preserved() {
    let mut case = Fixture::new();
    let custom = native::directory(&case.state, &case.record).join("custom");
    fs::create_dir(&custom).unwrap();
    fs::write(custom.join("keep.txt"), "keep").unwrap();
    case.record.draft.workdir = Some(custom.to_string_lossy().into_owned());
    case.plan(std::slice::from_ref(&case.record))
        .unwrap()
        .remove()
        .unwrap();
    assert!(custom.join("keep.txt").exists());
}

#[test]
fn invalid_assignment_is_rejected_before_any_data_is_removed() {
    let case = Fixture::new();
    fs::write(
        native::directory(&case.state, &case.record).join("workspace-name.json"),
        "\"../outside\"",
    )
    .unwrap();
    assert!(case.plan(std::slice::from_ref(&case.record)).is_err());
    assert!(case.workspace.join("result.txt").exists());
}

#[cfg(unix)]
#[test]
fn refuses_linked_roots_but_removes_nested_links_without_touching_their_targets() {
    let case = Fixture::new();
    let outside = case.state.join("outside");
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("keep.txt"), "keep").unwrap();
    std::os::unix::fs::symlink(&outside, case.workspace.join("link")).unwrap();
    case.plan(std::slice::from_ref(&case.record))
        .unwrap()
        .remove()
        .unwrap();
    assert!(outside.join("keep.txt").is_file());
    fs::create_dir(&case.workspace).unwrap();
    let runtime = native::directory(&case.state, &case.record);
    fs::create_dir_all(&runtime).unwrap();
    fs::write(runtime.join("workspace-name.json"), "\"Audit\"").unwrap();
    fs::remove_dir(&case.workspace).unwrap();
    std::os::unix::fs::symlink(&outside, &case.workspace).unwrap();
    assert!(case.plan(std::slice::from_ref(&case.record)).is_err());
    assert!(outside.join("keep.txt").is_file());
}

#[cfg(unix)]
#[test]
fn rechecks_changed_path_after_scheduler_removal_and_keeps_retry_metadata() {
    let case = Fixture::new();
    let plan = case.plan(std::slice::from_ref(&case.record)).unwrap();
    let moved = case.root.join("moved");
    fs::rename(&case.workspace, &moved).unwrap();
    std::os::unix::fs::symlink(&moved, &case.workspace).unwrap();
    assert!(plan.remove().is_err());
    assert!(moved.join("result.txt").is_file());
    assert!(native::directory(&case.state, &case.record)
        .join("workspace-name.json")
        .exists());
}

#[test]
fn hermes_cleanup_only_removes_its_exact_scoped_run_log() {
    let mut case = Fixture::new();
    case.record.draft.provider = Provider::Hermes;
    case.record.location = "profile/cron/jobs.json".into();
    let log =
        hermes_manage::run_log_path(&case.state, &case.record.location, &case.record.identifier);
    fs::create_dir_all(log.parent().unwrap()).unwrap();
    fs::write(&log, "run").unwrap();
    let other =
        hermes_manage::run_log_path(&case.state, "other/cron/jobs.json", &case.record.identifier);
    fs::write(&other, "keep").unwrap();
    case.plan(std::slice::from_ref(&case.record))
        .unwrap()
        .remove()
        .unwrap();
    assert!(!log.exists());
    assert!(other.exists());
}

#[test]
fn repeated_cleanup_of_missing_data_is_safe() {
    let case = Fixture::new();
    case.plan(std::slice::from_ref(&case.record))
        .unwrap()
        .remove()
        .unwrap();
    case.plan(std::slice::from_ref(&case.record))
        .unwrap()
        .remove()
        .unwrap();
}

#[cfg(unix)]
#[test]
fn linked_ownership_record_cannot_claim_an_unrelated_workspace() {
    let case = Fixture::new();
    let assignment = native::directory(&case.state, &case.record).join("workspace-name.json");
    let forged = case.state.join("forged.json");
    fs::write(&forged, "\"Audit\"").unwrap();
    fs::remove_file(&assignment).unwrap();
    std::os::unix::fs::symlink(&forged, assignment).unwrap();
    assert!(case.plan(std::slice::from_ref(&case.record)).is_err());
    assert!(case.workspace.join("result.txt").exists());
}
