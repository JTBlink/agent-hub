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
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn catalog_keeps_repository_path_when_scan_root_is_nested() {
        let repo = tempdir().unwrap();
        let scan = repo.path().join("skills");
        let skill = scan.join("category/demo");
        fs::create_dir_all(&skill).unwrap();
        fs::write(
            skill.join("SKILL.md"),
            "---\nname: Demo\ndescription: Example\nmetadata:\n  version: '1.2.3'\n---\n",
        )
        .unwrap();
        let preview = preview_skill(repo.path(), &scan, &skill);
        assert_eq!(preview.rel_path, "category/demo");
        assert_eq!(preview.repo_path, "skills/category/demo");
        assert_eq!(preview.name, "Demo");
        assert_eq!(preview.description.as_deref(), Some("Example"));
        assert_eq!(preview.version.as_deref(), Some("1.2.3"));
    }

    #[test]
    fn catalog_distinguishes_root_skill_from_nested_skills() {
        let repo = tempdir().unwrap();
        let preview = preview_skill(repo.path(), repo.path(), repo.path());
        assert_eq!(preview.repo_path, "");
        assert!(!preview.rel_path.is_empty());
    }

    #[test]
    fn local_catalog_reads_uncommitted_skills_and_rejects_non_repositories() {
        let root = tempdir().unwrap();
        assert!(scan_local_repository(root.path()).is_err());
        git2::Repository::init(root.path()).unwrap();
        let skill = root.path().join("skills/demo");
        fs::create_dir_all(&skill).unwrap();
        fs::write(skill.join("SKILL.md"), "---\nname: Demo\n---\n").unwrap();
        let catalog = scan_local_repository(root.path()).unwrap();
        assert_eq!(catalog.skills.len(), 1);
        assert_eq!(catalog.skills[0].repo_path, "skills/demo");
        assert!(resolve_local_skill(root.path(), "skills/demo").is_ok());
        assert!(resolve_local_skill(root.path(), "../outside").is_err());
        assert!(scan_local_repository(&skill).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn local_catalog_never_imports_symlinks_outside_the_repository() {
        let root = tempdir().unwrap();
        git2::Repository::init(root.path()).unwrap();
        let external = tempdir().unwrap();
        fs::write(
            external.path().join("SKILL.md"),
            "---\nname: External\n---\n",
        )
        .unwrap();
        std::os::unix::fs::symlink(external.path(), root.path().join("escape")).unwrap();
        assert!(scan_local_repository(root.path())
            .unwrap()
            .skills
            .is_empty());
        assert!(resolve_local_skill(root.path(), "escape").is_err());
    }
}
