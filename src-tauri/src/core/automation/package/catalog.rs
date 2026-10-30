//! Read-only Git discovery. Previewed package bytes are imported later without refetching.
use super::AutomationPackage;
use crate::core::{git_fetcher, path_guard};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct PackageEntry {
    pub path: String,
    pub package: AutomationPackage,
}
#[derive(Serialize)]
pub struct CatalogIssue {
    pub path: String,
    pub message: String,
}
#[derive(Serialize)]
pub struct GitAutomationCatalog {
    pub revision: String,
    pub packages: Vec<PackageEntry>,
    pub issues: Vec<CatalogIssue>,
}

struct Checkout(std::path::PathBuf);
impl Drop for Checkout {
    fn drop(&mut self) {
        git_fetcher::cleanup_temp(&self.0);
    }
}

/// Fetch once, pin HEAD for display, collect bounded package snapshots, and clean the checkout.
pub fn preview_git(
    url: &str,
    reference: Option<&str>,
    proxy: Option<&str>,
) -> Result<GitAutomationCatalog, String> {
    git_fetcher::validate_git_url(url).map_err(|e| e.to_string())?;
    let source = git_fetcher::parse_git_source_resolved(url, proxy);
    let checkout = Checkout(
        git_fetcher::clone_repo_ref_scoped(
            &source.clone_url,
            reference
                .filter(|r| !r.trim().is_empty())
                .or(source.branch.as_deref()),
            source.subpath.as_deref(),
            None,
            proxy,
            None,
        )
        .map_err(|e| e.to_string())?,
    );
    let root = if let Some(relative) = source.subpath {
        path_guard::ensure_safe_skill_relative_path(&relative).map_err(|e| e.to_string())?;
        let root = checkout.0.join(relative);
        if !path_guard::is_path_safe(&checkout.0, &root) {
            return Err("Task source must stay inside the repository".into());
        }
        root
    } else {
        checkout.0.clone()
    };
    let revision = git_fetcher::get_head_revision(&checkout.0).map_err(|e| e.to_string())?;
    scan(&root, revision)
}

fn scan(root: &Path, revision: String) -> Result<GitAutomationCatalog, String> {
    super::storage::regular_directory(root)?;
    // A selected task wins; otherwise prefer the conventional automation-only subtree.
    let scan_root = if !root.join("task.json").exists() && root.join("automations").is_dir() {
        root.join("automations")
    } else {
        root.to_path_buf()
    };
    super::storage::regular_directory(&scan_root)?;
    let mut result = GitAutomationCatalog {
        revision,
        packages: vec![],
        issues: vec![],
    };
    let mut bytes = 0;
    let walk = walkdir::WalkDir::new(&scan_root)
        .max_depth(6)
        .follow_links(false)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|entry| {
            entry.depth() == 0
                || (!entry.file_name().to_string_lossy().starts_with('.')
                    && !["node_modules", "target", "dist", "vendor", "skills"]
                        .contains(&entry.file_name().to_string_lossy().as_ref()))
        });
    for (index, entry) in walk.enumerate() {
        if index >= 4096 {
            return Err("Task repository is too large; select an automation subdirectory".into());
        }
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().is_file() || entry.file_name() != "task.json" {
            continue;
        }
        if result.packages.len() + result.issues.len() >= 100 {
            return Err("Too many tasks; select an automation subdirectory".into());
        }
        let directory = entry.path().parent().ok_or("Missing task directory")?;
        let path = directory
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let path = if path.is_empty() { ".".into() } else { path };
        match super::preview_package(directory) {
            Ok(package) => {
                bytes += serde_json::to_vec(&package)
                    .map_err(|e| e.to_string())?
                    .len();
                if bytes > 16 * 1024 * 1024 {
                    return Err("Task preview exceeds 16 MiB; select fewer tasks".into());
                }
                result.packages.push(PackageEntry { path, package });
            }
            Err(message) => result.issues.push(CatalogIssue { path, message }),
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn task(root: &Path, name: &str) {
        let dir = root.join(name);
        std::fs::create_dir_all(&dir).unwrap();
        let package = serde_json::json!({"schema_version":1,"shell":crate::core::automation::command_shell(),
            "draft":{"name":name,"provider":"system","content":"echo example","workdir":null,
            "schedule":{"kind":"manual"},"enabled":true,"files":[]},"files":[]});
        std::fs::write(dir.join("task.json"), serde_json::to_vec(&package).unwrap()).unwrap();
    }
    #[test]
    fn isolates_broken_tasks_and_previews_paused_snapshots() {
        let temp = tempfile::tempdir().unwrap();
        task(temp.path(), "automations/dev/a");
        task(temp.path(), "automations/dev/b");
        std::fs::write(temp.path().join("automations/dev/b/task.json"), "broken").unwrap();
        task(temp.path(), "skills/ignored");
        let result = scan(temp.path(), "fixed-commit".into()).unwrap();
        assert_eq!(result.revision, "fixed-commit");
        assert_eq!(result.packages.len(), 1);
        assert_eq!(result.issues.len(), 1);
        assert_eq!(result.packages[0].path, "automations/dev/a");
        assert!(!result.packages[0].package.draft.enabled);
        assert!(!temp.path().join("automations/dev/a/.local").exists());
    }
    #[test]
    fn supports_a_task_at_repository_root() {
        let temp = tempfile::tempdir().unwrap();
        task(temp.path(), ".");
        assert_eq!(
            scan(temp.path(), "commit".into()).unwrap().packages[0].path,
            "."
        );
    }
    #[test]
    fn rejects_local_and_command_transport_urls_before_fetch() {
        assert!(preview_git("ext::command", None, None).is_err());
        assert!(preview_git("file:///tmp/example", None, None).is_err());
    }
    #[test]
    fn snapshot_keeps_the_previewed_script_bytes_after_source_changes() {
        let temp = tempfile::tempdir().unwrap();
        task(temp.path(), ".");
        let file = temp.path().join("task.json");
        let mut manifest: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
        manifest["files"] = serde_json::json!(["scripts/run.sh"]);
        std::fs::write(&file, serde_json::to_vec(&manifest).unwrap()).unwrap();
        std::fs::create_dir(temp.path().join("scripts")).unwrap();
        std::fs::write(temp.path().join("scripts/run.sh"), "echo first").unwrap();
        let first = scan(temp.path(), "first-commit".into()).unwrap();
        std::fs::write(temp.path().join("scripts/run.sh"), "echo changed").unwrap();
        assert_eq!(
            first.packages[0].package.draft.files[0].content,
            "echo first"
        );
        assert_eq!(
            scan(temp.path(), "next-commit".into()).unwrap().packages[0]
                .package
                .draft
                .files[0]
                .content,
            "echo changed"
        );
    }
    #[test]
    fn limits_repository_task_count() {
        let temp = tempfile::tempdir().unwrap();
        for index in 0..101 {
            task(temp.path(), &format!("automations/task-{index}"));
        }
        assert!(scan(temp.path(), "commit".into())
            .err()
            .unwrap()
            .contains("Too many tasks"));
    }
    #[cfg(unix)]
    #[test]
    fn never_follows_repository_symlinks() {
        let temp = tempfile::tempdir().unwrap();
        let external = tempfile::tempdir().unwrap();
        task(external.path(), "private");
        std::os::unix::fs::symlink(external.path(), temp.path().join("linked")).unwrap();
        assert!(scan(temp.path(), "commit".into())
            .unwrap()
            .packages
            .is_empty());
    }
}

#[cfg(all(test, not(windows)))]
mod distribution_tests {
    use super::*;
    #[test]
    fn repository_automations_are_real_independent_installable_packages() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../automations");
        let result = scan(&root, "fixture-commit".into()).unwrap();
        assert!(
            result.issues.is_empty(),
            "{:?}",
            result
                .issues
                .iter()
                .map(|i| (&i.path, &i.message))
                .collect::<Vec<_>>()
        );
        assert_eq!(result.packages.len(), 10);
        let shared = std::fs::read_to_string(root.join("_shared/herdr-agent.py")).unwrap();
        for entry in result.packages {
            assert!(!entry.package.draft.enabled);
            assert!(entry.package.draft.workdir.is_none());
            assert!(entry.package.draft.script_dir.is_none());
            if entry.path.starts_with("engineering/") {
                let agent = entry
                    .package
                    .draft
                    .files
                    .iter()
                    .find(|f| {
                        f.path.ends_with("agent.py") || f.path.ends_with("agent-code-review.py")
                    })
                    .unwrap();
                assert_eq!(
                    agent.content, shared,
                    "shared runtime must match for {}",
                    entry.path
                );
            }
        }
    }
}
