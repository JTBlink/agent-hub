//! Git diagnostics for portable project files; never stages or edits files.
use std::{collections::BTreeSet, path::Path};

use crate::core::content_hash::is_regenerable;

/// Local environment values are not team content. Keep example/template files
/// visible so an ignored setup template still produces a delivery warning.
fn is_local_environment(name: &str) -> bool {
    let template = matches!(name, "example.env" | "sample.env" | "template.env")
        || name.ends_with(".example")
        || name.ends_with(".sample")
        || name.ends_with(".template");
    !template && (name == ".env" || name.starts_with(".env.") || name.ends_with(".env"))
}

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
            .filter_entry(|entry| {
                let name = entry.file_name().to_string_lossy();
                !is_regenerable(&name)
                    && !(entry.file_type().is_file() && is_local_environment(&name))
            })
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const SKILL: &str = ".agents/skills/demo";

    fn project(ignore_rules: &str, paths: &[&str]) -> tempfile::TempDir {
        let directory = tempfile::tempdir().unwrap();
        git2::Repository::init(directory.path()).unwrap();
        fs::write(directory.path().join(".gitignore"), ignore_rules).unwrap();
        for path in paths {
            let file = directory.path().join(SKILL).join(path);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, "fixture").unwrap();
        }
        directory
    }

    fn report(directory: &tempfile::TempDir) -> Vec<String> {
        // Match status(), which canonicalizes the project root before Git
        // diagnostics (macOS temporary paths can have a symlinked ancestor).
        ignored_paths(&directory.path().canonicalize().unwrap(), &[SKILL.into()])
    }

    #[test]
    fn ignored_caches_and_local_environment_files_need_no_delivery_warning() {
        let directory = project(
            "__pycache__/\n*.pyc\n.DS_Store\nThumbs.db\n.env*\n*.env\n",
            &[
                "SKILL.md",
                "scripts/__pycache__/run.cpython-311.pyc",
                "scripts/__pycache__/metadata.json",
                "scripts/stray.pyc",
                ".DS_Store",
                "Thumbs.db",
                ".env",
                ".env.local",
                ".env.production",
                "config/wechat.env",
            ],
        );
        assert!(report(&directory).is_empty());
    }

    #[test]
    fn ignored_scripts_resources_and_environment_templates_still_warn() {
        let paths = [
            "scripts/run.sh",
            "scripts/extension.pyd",
            "resources/reference.md",
            ".env.example",
            ".env.sample",
            ".env.template",
            "config/wechat.env.example",
            "config/example.env",
            "config/sample.env",
            "config/template.env",
        ];
        let directory = project(
            "*.sh\n*.pyd\nreference.md\n.env*\n*.example\n*.env\n",
            &paths,
        );
        let expected: BTreeSet<_> = paths.iter().map(|path| format!("{SKILL}/{path}")).collect();
        assert_eq!(
            report(&directory).into_iter().collect::<BTreeSet<_>>(),
            expected
        );
    }

    #[test]
    fn ignored_parent_with_only_local_additions_does_not_warn() {
        let directory = project(
            ".agents/\n",
            &[
                "SKILL.md",
                "scripts/__pycache__/run.pyc",
                "config/wechat.env",
            ],
        );
        let repo = git2::Repository::open(directory.path()).unwrap();
        let mut index = repo.index().unwrap();
        index
            .add_path(Path::new(&format!("{SKILL}/SKILL.md")))
            .unwrap();
        index.write().unwrap();
        assert!(report(&directory).is_empty());

        fs::write(
            directory.path().join(SKILL).join("scripts/run.py"),
            "fixture",
        )
        .unwrap();
        assert_eq!(report(&directory), [SKILL]);
    }
}
