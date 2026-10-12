//! Git diagnostics for portable project files; never stages or edits files.
use std::{collections::BTreeSet, path::Path};

pub(super) fn ignored_paths(root: &Path, files: &[String]) -> Vec<String> {
    let Ok(repo) = git2::Repository::discover(root) else {
        return Vec::new();
    };
    let Some(raw_workdir) = repo.workdir() else {
        return Vec::new();
    };
    // On Windows `root` is canonicalized (may carry the `\\?\` prefix) while
    // `repo.workdir()` usually doesn't; canonicalize the workdir so both
    // sides of `strip_prefix` use the same path format.
    let workdir = std::fs::canonicalize(raw_workdir).unwrap_or_else(|_| raw_workdir.to_path_buf());
    let Ok(index) = repo.index() else {
        return Vec::new();
    };
    let mut ignored = BTreeSet::new();
    for path in files {
        let shared_root = path
            .split('/')
            .fold(root.to_path_buf(), |acc, part| acc.join(part));
        for entry in walkdir::WalkDir::new(&shared_root)
            .follow_root_links(false)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file() || entry.file_type().is_symlink())
        {
            let Ok(relative) = entry.path().strip_prefix(&workdir) else {
                continue;
            };
            // A tracked file is still delivered even when an ignore rule matches it.
            if index.get_path(relative, 0).is_some()
                || !repo.is_path_ignored(relative).unwrap_or(false)
            {
                continue;
            }
            // Report the highest ignored directory within this shared entry once.
            // Inspect files first so fully tracked directories and empty folders
            // don't produce warnings merely because their directory is ignored.
            let blocked = entry
                .path()
                .ancestors()
                .take_while(|ancestor| ancestor.starts_with(&shared_root))
                .filter(|ancestor| {
                    ancestor
                        .strip_prefix(&workdir)
                        .ok()
                        .is_some_and(|path| repo.is_path_ignored(path).unwrap_or(false))
                })
                .last()
                .unwrap_or(entry.path());
            if let Ok(relative) = blocked.strip_prefix(root) {
                ignored.insert(relative.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    ignored.into_iter().collect()
}
