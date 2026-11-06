use super::Snapshot;
use std::{collections::HashSet, io::ErrorKind, path::Path};

// Filter the display snapshot only; never close native sessions or terminals.
// Unknown paths and access errors are not evidence that a checkout was removed.
pub(super) fn remove_missing_workspaces(snapshot: &mut Snapshot) {
    let removed: HashSet<_> = snapshot
        .workspaces
        .iter()
        .filter(|workspace| {
            let checkout = workspace
                .worktree
                .as_ref()
                .and_then(|tree| tree.get("checkout_path"))
                .and_then(serde_json::Value::as_str);
            if let Some(path) = checkout {
                return missing_directory(path);
            }
            let paths: Vec<_> = snapshot
                .panes
                .iter()
                .filter(|pane| pane.workspace_id == workspace.workspace_id)
                .map(|pane| pane.cwd.as_deref())
                .collect();
            !paths.is_empty() && paths.iter().all(|path| path.is_some_and(missing_directory))
        })
        .map(|workspace| workspace.workspace_id.clone())
        .collect();
    snapshot
        .workspaces
        .retain(|w| !removed.contains(&w.workspace_id));
    let removed_tabs: HashSet<_> = snapshot
        .tabs
        .iter()
        .filter(|tab| removed.contains(&tab.workspace_id))
        .map(|tab| tab.tab_id.clone())
        .collect();
    snapshot.tabs.retain(|t| !removed.contains(&t.workspace_id));
    snapshot
        .panes
        .retain(|p| !removed.contains(&p.workspace_id));
    snapshot
        .agents
        .retain(|p| !removed.contains(&p.workspace_id));
    snapshot
        .layouts
        .retain(|l| !removed_tabs.contains(&l.tab_id));
}

fn missing_directory(path: &str) -> bool {
    let path = Path::new(path);
    path.is_absolute()
        && matches!(std::fs::metadata(path), Err(error) if error.kind() == ErrorKind::NotFound)
}
