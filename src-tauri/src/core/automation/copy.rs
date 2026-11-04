//! Copy portable task content into an editable draft with independent runtime storage.
use super::{AutomationDraft, AutomationTask, TaskOrigin};
use std::path::Path;

/// Read the current full task definition without registering or running a copy.
pub fn copy_draft(id: &str, revision: Option<u64>) -> Result<AutomationDraft, String> {
    super::sync_workspace_scripts()?;
    from_task(&super::managed::find(id)?, revision)
}

pub(super) fn from_task(
    task: &AutomationTask,
    revision: Option<u64>,
) -> Result<AutomationDraft, String> {
    if task.origin != TaskOrigin::AgentHub || !task.can_edit || task.is_builtin {
        return Err("Only editable AgentHub tasks can be copied".into());
    }
    if revision.is_some() && revision != task.revision {
        return Err("Task changed; refresh before copying".into());
    }
    let mut draft = task
        .definition
        .clone()
        .ok_or("Task definition is unavailable")?;
    // A project binding may be retained; a binding into the original package
    // would share private state and must instead use the new package's default.
    if let (Some(workdir), Some(scripts)) = (&draft.workdir, &draft.script_dir) {
        if crate::core::path_guard::is_path_safe(Path::new(scripts), Path::new(workdir)) {
            draft.workdir = None;
        }
    }
    draft.script_dir = None;
    draft.enabled = false;
    Ok(draft)
}

#[cfg(test)]
mod tests;
