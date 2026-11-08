use super::{directory_for, directory_for_pane, Snapshot};
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

// Match the pane that opening the workspace selects. Other tabs or an unused
// split can have unrelated working directories without invalidating this row.
pub(super) fn enrich_workspaces(snapshot: &mut Snapshot) {
    for workspace in &mut snapshot.workspaces {
        let mut panes = snapshot.panes.iter().filter(|pane| {
            pane.workspace_id == workspace.workspace_id && pane.tab_id == workspace.active_tab_id
        });
        let pane = panes
            .clone()
            .find(|pane| pane.focused)
            .or_else(|| panes.next());
        let directory = match pane {
            Some(pane) => directory_for_pane(workspace, &snapshot.panes, pane),
            None => directory_for(workspace, &snapshot.panes),
        };
        workspace.directory = directory
            .ok()
            .map(|path| path.to_string_lossy().into_owned());
        let repository = workspace
            .directory
            .as_deref()
            .and_then(|path| git2::Repository::discover(path).ok());
        workspace.detached = repository
            .as_ref()
            .is_some_and(|repo| repo.head_detached().ok() == Some(true));
        workspace.head = repository.as_ref().and_then(|repo| {
            repo.head()
                .ok()
                .and_then(|head| head.target())
                .map(|id| id.to_string())
        });
        workspace.branch = repository
            .as_ref()
            .filter(|_| !workspace.detached)
            .and_then(|repo| {
                repo.head()
                    .ok()
                    .and_then(|head| head.shorthand().map(str::to_owned))
            });
        workspace.repository_icon = repository.as_ref().map(|repo| {
            let remote = repo.find_remote("origin").ok();
            let url = remote
                .as_ref()
                .and_then(|remote| remote.url())
                .unwrap_or("");
            let host = if let Some((_, rest)) = url.split_once("://") {
                rest.split('/')
                    .next()
                    .unwrap_or("")
                    .rsplit('@')
                    .next()
                    .unwrap_or("")
            } else {
                url.split(':')
                    .next()
                    .unwrap_or("")
                    .rsplit('@')
                    .next()
                    .unwrap_or("")
            };
            match host {
                "github.com" => "github",
                "gitlab.com" => "gitlab",
                _ => "git",
            }
            .to_owned()
        });
    }
}

#[cfg(test)]
mod tests;
