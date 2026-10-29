//! Explicit task-data cleanup. Never infer ownership from a human-readable name.
use super::{definition::valid_id, hermes_manage, native, workspace, ManagedAutomation, Provider};
use crate::core::path_guard::{ensure_dir_within_root, is_link_or_reparse_point, is_path_safe};
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

struct Target {
    root: PathBuf,
    path: PathBuf,
    directory: bool,
}

pub(super) struct Cleanup {
    targets: Vec<Target>,
}

fn overlaps(first: &Path, second: &Path) -> bool {
    is_path_safe(first, second) || is_path_safe(second, first)
}

fn check(target: &Target) -> Result<bool, String> {
    ensure_dir_within_root(&target.path, &target.root).map_err(|e| e.to_string())?;
    let relative = target
        .path
        .strip_prefix(&target.root)
        .map_err(|e| e.to_string())?;
    if relative.as_os_str().is_empty()
        || relative
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("Cannot delete a task-data root or an escaping path".into());
    }
    let mut current = target.root.clone();
    let parts = std::iter::once(current.clone()).chain(relative.components().map(|part| {
        current.push(part);
        current.clone()
    }));
    for path in parts {
        match fs::symlink_metadata(&path) {
            Ok(metadata) => {
                if is_link_or_reparse_point(&metadata) {
                    return Err("Task data contains a linked root or parent; delete the task without local-data cleanup to keep it".into());
                }
                if path != target.path && !metadata.is_dir() {
                    return Err("A task-data parent is not a directory".into());
                }
                if path == target.path
                    && (metadata.is_dir() != target.directory
                        || (!target.directory && !metadata.is_file()))
                {
                    return Err("Task-data type changed; local data was kept".into());
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(format!("Cannot inspect task data: {error}")),
        }
    }
    if !is_path_safe(&target.root, &target.path) {
        return Err("Task data escaped its managed root".into());
    }
    Ok(true)
}

impl Cleanup {
    /// Also preserve directories referenced by discovered external scheduler jobs.
    pub(super) fn protect_workspaces(mut self, paths: impl Iterator<Item = PathBuf>) -> Self {
        let protected: Vec<_> = paths.collect();
        self.targets
            .retain(|target| !protected.iter().any(|path| overlaps(&target.path, path)));
        self
    }

    pub(super) fn plan(
        state: &Path,
        workspaces: &Path,
        record: &ManagedAutomation,
        records: &[ManagedAutomation],
    ) -> Result<Self, String> {
        if !valid_id(&record.id) {
            return Err("Local-data cleanup requires an AgentHub creation record".into());
        }
        let owned = workspace::owned_directories_at(workspaces, state, record)?;
        let mut protected = Vec::new();
        for other in records.iter().filter(|other| other.id != record.id) {
            if let Some(path) = &other.draft.workdir {
                protected.push(PathBuf::from(path));
            }
            protected.extend(workspace::owned_directories_at(workspaces, state, other)?);
        }
        // Even a manually selected path inside internal state must survive.
        if let Some(path) = record.draft.workdir.as_ref().map(PathBuf::from) {
            if !owned.iter().any(|directory| is_path_safe(directory, &path)) {
                protected.push(path);
            }
        }
        let mut targets: Vec<_> = owned
            .into_iter()
            .map(|path| Target {
                root: workspaces.into(),
                path,
                directory: true,
            })
            .collect();
        if record.draft.provider == Provider::Hermes {
            targets.push(Target {
                root: state.into(),
                path: hermes_manage::run_log_path(state, &record.location, &record.identifier),
                directory: false,
            });
        }
        // Assignment and retry metadata remain available until workspace cleanup succeeds.
        targets.push(Target {
            root: state.into(),
            path: native::directory(state, record),
            directory: true,
        });
        targets.retain(|target| !protected.iter().any(|path| overlaps(&target.path, path)));
        for target in &targets {
            check(target)?;
        }
        Ok(Self { targets })
    }

    pub(super) fn remove(self) -> Result<(), String> {
        for target in self.targets {
            // Recheck after scheduler removal; missing entries are a repeatable no-op.
            if check(&target)? {
                let result = if target.directory {
                    fs::remove_dir_all(&target.path)
                } else {
                    fs::remove_file(&target.path)
                };
                result.map_err(|error| {
                    format!("Task stopped, but local-data cleanup failed; retry deletion: {error}")
                })?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
pub(super) mod tests;
