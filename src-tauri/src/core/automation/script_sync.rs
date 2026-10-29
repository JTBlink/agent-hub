//! Reconcile customized workspace scripts into portable, revisioned definitions.
use super::{managed, native::payload, store, Provider};
use std::path::Path;

pub fn sync_workspace_scripts() -> Result<(), String> {
    sync_at(&store::root())
}

pub(super) fn sync_at(root: &Path) -> Result<(), String> {
    if !root.join("tasks.json").is_file() {
        return Ok(());
    }
    let _lock = store::Lock::acquire(root)?;
    let registry = store::read_registry(root)?;
    let mut records = registry.tasks;
    let mut changed = false;
    let mut errors = Vec::new();
    for record in records.iter_mut().filter(|record| {
        record.draft.provider == Provider::System
            && record.draft.scripts_dir().is_some()
            && !registry.removal_pending.contains(&record.id)
    }) {
        let result = (|| {
            managed::verify(root, record)?;
            let mut draft = record.draft.clone();
            if let Some(content) = payload::read(root, record)? {
                draft.content = content;
            }
            draft.files = super::native::bundle_files::read(record)?;
            draft.validate()?;
            Ok::<_, String>(draft)
        })();
        match result {
            Ok(draft) if draft != record.draft => {
                record.draft = draft;
                record.revision = record
                    .revision
                    .checked_add(1)
                    .ok_or("Automation revision exhausted")?;
                changed = true;
            }
            Err(error) => errors.push(format!("{}: {error}", record.draft.name)),
            _ => {}
        }
    }

    if changed {
        store::save(root, records)?;
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::automation::{AutomationDraft, ManagedAutomation, Schedule};

    #[test]
    fn edited_files_increment_revision_and_queue_the_custom_script_for_backup() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("runtime");
        let workspace = temp.path().join("workspace");
        std::fs::create_dir(&workspace).unwrap();
        let mut record = ManagedAutomation {
            id: format!("agent_hub:{}", uuid::Uuid::new_v4()),
            revision: 1,
            draft: AutomationDraft {
                files: vec![
                    super::super::AutomationScriptFile {
                        path: "bundle/main.py".into(),
                        content: "print('original')".into(),
                    },
                    super::super::AutomationScriptFile {
                        path: "bundle/helper.py".into(),
                        content: "VALUE = 1".into(),
                    },
                ],
                name: "Cleanup".into(),
                provider: Provider::System,
                content: "exit 0".into(),
                script_dir: None,
                workdir: Some(workspace.to_string_lossy().into_owned()),
                schedule: Schedule::Manual,
                enabled: false,
            },
            source: super::super::native::source().into(),
            identifier: String::new(),
            location: String::new(),
        };
        let (identifier, location) = super::super::native::paths(&root, &record).unwrap();
        record.identifier = identifier;
        record.location = location.to_string_lossy().into_owned();
        store::save(&root, vec![record.clone()]).unwrap();
        let file = payload::write(
            &super::super::native::directory(&root, &record),
            &record.draft,
            &record.id,
            true,
        )
        .unwrap();
        std::fs::write(&file, "printf customized").unwrap();
        std::fs::write(workspace.join("bundle/main.py"), "print('customized')").unwrap();
        std::fs::write(workspace.join("bundle/helper.py"), "VALUE = 2").unwrap();
        sync_at(&root).unwrap();
        let registry = store::read_registry(&root).unwrap();
        assert_eq!(registry.tasks[0].revision, 2);
        assert_eq!(registry.tasks[0].draft.content, "printf customized");
        assert_eq!(
            registry.pending_backup[&record.id]
                .as_ref()
                .unwrap()
                .content,
            "printf customized"
        );
        assert_eq!(
            registry.tasks[0].draft.files[0].content,
            "print('customized')"
        );
        assert_eq!(registry.tasks[0].draft.files[1].content, "VALUE = 2");
        assert_eq!(
            registry.pending_backup[&record.id]
                .as_ref()
                .unwrap()
                .files
                .len(),
            2
        );
        assert!(!registry.tasks[0].draft.enabled);
        sync_at(&root).unwrap();
        assert_eq!(store::load(&root).unwrap()[0].revision, 2);
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "printf customized");
        std::fs::write(&file, "").unwrap();
        assert!(
            sync_at(&root).is_err(),
            "invalid files must not be backed up as stale content"
        );
        assert_eq!(store::load(&root).unwrap()[0].revision, 2);
    }
}
