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

/// Inspect local declared packages using the same bounded discovery as Git preview.
pub fn scan_local(root: &Path) -> Result<GitAutomationCatalog, String> {
    scan(root, "local".into())
}

/// Inspect portable definitions for audits, keeping native-shell import checks separate.
pub(in crate::core::automation) fn scan_portable(
    root: &Path,
) -> Result<GitAutomationCatalog, String> {
    scan_with_shell_validation(root, "local".into(), false)
}

fn scan(root: &Path, revision: String) -> Result<GitAutomationCatalog, String> {
    scan_with_shell_validation(root, revision, true)
}

fn scan_with_shell_validation(
    root: &Path,
    revision: String,
    native_shell: bool,
) -> Result<GitAutomationCatalog, String> {
    super::storage::regular_directory(root)?;
    // A selected task wins; otherwise prefer the conventional automation-only subtree.
    let scan_root = if !super::manifest_path(root).exists() && root.join("automations").is_dir() {
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
                    && ![
                        "node_modules",
                        "target",
                        "dist",
                        "vendor",
                        "skills",
                        "_shared",
                    ]
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
        let directory = super::manifest_directory(entry.path())?;
        let path = directory
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let path = if path.is_empty() { ".".into() } else { path };
        let preview = if native_shell {
            super::preview_package(directory)
        } else {
            super::exchange::preview_portable_package(directory)
        };
        match preview {
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
mod tests;

#[cfg(all(test, not(windows)))]
mod distribution_tests;
