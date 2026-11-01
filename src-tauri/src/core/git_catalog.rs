use crate::core::{git_fetcher, path_guard, scanner, skill_metadata};
use anyhow::{bail, Context, Result};
use std::path::{Path, PathBuf};

#[derive(Debug, serde::Serialize)]
pub struct GitSkillPreview {
    /// Path relative to the scan root; used by the preview/confirm contract.
    pub rel_path: String,
    /// Path relative to the repository root; used for provenance matching.
    pub repo_path: String,
    pub name: String,
    pub description: Option<String>,
    pub version: Option<String>,
}

/// Stable preview/confirm key, including when the scan root is itself a skill.
pub fn skill_rel_key(skill_dir: &Path, dir: &Path) -> String {
    let rel = dir.strip_prefix(skill_dir).unwrap_or(dir);
    if rel.as_os_str().is_empty() {
        dir.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default()
    } else {
        rel.to_string_lossy().replace('\\', "/")
    }
}

/// Build a catalog entry without exposing the checkout's local absolute path.
pub fn preview_skill(repo_root: &Path, scan_root: &Path, dir: &Path) -> GitSkillPreview {
    let meta = skill_metadata::parse_skill_md(dir);
    let rel_path = skill_rel_key(scan_root, dir);
    let fallback = dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| rel_path.clone());
    GitSkillPreview {
        rel_path,
        repo_path: git_fetcher::relative_subpath(repo_root, dir)
            .unwrap_or_default()
            .replace('\\', "/"),
        name: meta
            .name
            .filter(|name| !name.trim().is_empty())
            .unwrap_or(fallback),
        description: meta.description,
        version: meta.version,
    }
}

#[derive(Debug, serde::Serialize)]
pub struct LocalGitCatalog {
    pub path: String,
    pub skills: Vec<GitSkillPreview>,
}

fn local_repository_root(path: &Path) -> Result<PathBuf> {
    let selected = path
        .canonicalize()
        .context("Local repository directory is unavailable")?;
    let repo = git2::Repository::open(&selected).context("Select a Git working tree")?;
    let root = repo
        .workdir()
        .context("Bare repositories have no Skills working tree")?
        .canonicalize()?;
    if selected != root {
        bail!("Select the root directory of the Git working tree");
    }
    Ok(root)
}

/// Read current working-tree content, including uncommitted Skills, without cloning.
pub fn scan_local_repository(path: &Path) -> Result<LocalGitCatalog> {
    let root = local_repository_root(path)?;
    let mut dirs = if skill_metadata::is_valid_skill_dir(&root) {
        vec![root.clone()]
    } else {
        scanner::collect_skill_dirs(&root)
    };
    dirs.retain(|dir| path_guard::is_path_safe(&root, dir));
    dirs = dirs
        .into_iter()
        .map(|dir| dir.canonicalize())
        .collect::<std::io::Result<Vec<_>>>()?;
    dirs.sort();
    dirs.dedup();
    Ok(LocalGitCatalog {
        path: root.to_string_lossy().to_string(),
        skills: dirs
            .iter()
            .map(|dir| preview_skill(&root, &root, dir))
            .collect(),
    })
}

/// Revalidate the root and containment immediately before local import.
pub fn resolve_local_skill(path: &Path, repo_path: &str) -> Result<PathBuf> {
    let root = local_repository_root(path)?;
    let candidate = root.join(repo_path);
    if !path_guard::is_path_safe(&root, &candidate)
        || !skill_metadata::is_valid_skill_dir(&candidate)
    {
        bail!("Skill directory is missing or outside the selected repository");
    }
    Ok(candidate.canonicalize()?)
}

#[cfg(test)]
mod tests;
