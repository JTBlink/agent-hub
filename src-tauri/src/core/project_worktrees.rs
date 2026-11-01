//! Project worktrees and bounded, lazy file browsing.
use anyhow::{bail, Context, Result};
use serde::Serialize;
use std::{
    io::Read,
    path::{Component, Path, PathBuf},
};

use super::{cli_process, path_guard, project_paths, skill_store::SkillStore};

#[derive(Clone, Debug, Serialize)]
pub struct ProjectWorktree {
    pub path: String,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub is_main: bool,
    pub locked: bool,
    pub available: bool,
}

#[derive(Serialize)]
pub struct WorktreeFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
}

pub fn list(store: &SkillStore, project_id: &str) -> Result<Vec<ProjectWorktree>> {
    list_directory(&project_paths::project_directory(store, project_id)?)
}

fn list_directory(directory: &Path) -> Result<Vec<ProjectWorktree>> {
    // A registered subdirectory/linked skills directory does not grant access
    // to its enclosing repository's other checkouts.
    match git2::Repository::open_ext(
        directory,
        git2::RepositoryOpenFlags::NO_SEARCH,
        &[] as &[&Path],
    ) {
        Ok(repo) if repo.workdir().is_some() => {}
        Ok(_) => bail!("A bare repository has no workspace directory"),
        Err(error) if error.code() == git2::ErrorCode::NotFound => {
            return Ok(vec![ProjectWorktree {
                path: directory.to_string_lossy().into_owned(),
                branch: None,
                head: None,
                is_main: true,
                locked: false,
                available: true,
            }]);
        }
        Err(error) => return Err(error.into()),
    }
    let output = cli_process::run(
        "git",
        &[
            "--no-optional-locks",
            "worktree",
            "list",
            "--porcelain",
            "-z",
        ],
        &[],
        15,
        Some(directory),
        None,
    )
    .map_err(anyhow::Error::msg)?;
    let worktrees = parse_worktrees(&output);
    if worktrees.is_empty() {
        bail!("Git returned no workspace directories");
    }
    Ok(worktrees)
}

fn parse_worktrees(output: &str) -> Vec<ProjectWorktree> {
    output
        .split("\0\0")
        .enumerate()
        .filter_map(|(index, record)| {
            let fields: Vec<_> = record.split('\0').collect();
            let path = fields.first()?.strip_prefix("worktree ")?;
            if fields.contains(&"bare") {
                return None;
            }
            Some(ProjectWorktree {
                path: path.to_owned(),
                branch: fields
                    .iter()
                    .find_map(|field| field.strip_prefix("branch refs/heads/").map(str::to_owned)),
                head: fields
                    .iter()
                    .find_map(|field| field.strip_prefix("HEAD ").map(str::to_owned)),
                is_main: index == 0,
                locked: fields
                    .iter()
                    .any(|field| *field == "locked" || field.starts_with("locked ")),
                available: Path::new(path).is_dir()
                    && !fields
                        .iter()
                        .any(|field| *field == "prunable" || field.starts_with("prunable ")),
            })
        })
        .collect()
}

/// Authorize a checkout against the registered project's current Git metadata.
/// An omitted path preserves existing terminal callers' registered directory.
pub fn directory(
    store: &SkillStore,
    project_id: &str,
    worktree_path: Option<&str>,
) -> Result<PathBuf> {
    let root = project_paths::project_directory(store, project_id)?;
    let Some(requested) = worktree_path else {
        return Ok(root);
    };
    let candidate = Path::new(requested)
        .canonicalize()
        .context("Worktree directory is unavailable")?;
    let allowed = list_directory(&root)?.into_iter().any(|entry| {
        entry.available && Path::new(&entry.path).canonicalize().ok().as_ref() == Some(&candidate)
    });
    if !allowed {
        bail!("Worktree does not belong to this registered project");
    }
    Ok(candidate)
}

/// Create a new branch and checkout from an authorized worktree's current HEAD.
/// Existing destinations and branches are never overwritten.
pub fn create(
    store: &SkillStore,
    project_id: &str,
    source_path: &str,
    branch: &str,
    destination: &str,
) -> Result<ProjectWorktree> {
    let source = directory(store, project_id, Some(source_path))?;
    let repo = git2::Repository::open_ext(
        &source,
        git2::RepositoryOpenFlags::NO_SEARCH,
        &[] as &[&Path],
    )?;
    let head = repo
        .head()
        .context("Create a commit before creating a worktree")?
        .peel_to_commit()?
        .id()
        .to_string();
    super::project_git::validate_branch_name(branch)?;
    if repo.find_branch(branch, git2::BranchType::Local).is_ok() {
        bail!("Branch already exists; enter a new branch name");
    }
    let target = Path::new(destination);
    if !target.is_absolute()
        || target
            .components()
            .any(|part| matches!(part, Component::ParentDir))
    {
        bail!("Enter an absolute destination path without parent traversal");
    }
    let parent = target
        .parent()
        .context("Select a destination directory")?
        .canonicalize()
        .context("Destination parent directory must exist")?;
    let target = parent.join(
        target
            .file_name()
            .context("Select a new destination directory")?,
    );
    if target.components().any(|part| {
        part.as_os_str()
            .to_str()
            .is_some_and(|name| name.eq_ignore_ascii_case(".git"))
    }) {
        bail!("Destination cannot be inside Git metadata");
    }
    if target.symlink_metadata().is_ok() {
        bail!("Destination already exists; choose a new directory");
    }
    let target_str = target.to_str().context("Destination must be valid UTF-8")?;
    super::project_git::run_git(
        &source,
        &["worktree", "add", "-b", branch, "--", target_str, &head],
    )?;
    Ok(ProjectWorktree {
        path: target_str.to_owned(),
        branch: Some(branch.to_owned()),
        head: Some(head),
        is_main: false,
        locked: false,
        available: true,
    })
}

fn file_path(root: &Path, relative: &str) -> Result<PathBuf> {
    if Path::new(relative)
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
    {
        bail!("Invalid workspace file path");
    }
    let path = root.join(relative);
    if !path_guard::is_path_safe(root, &path) {
        bail!("File is outside the selected worktree");
    }
    Ok(path)
}

pub fn entries(root: &Path, relative: &str) -> Result<Vec<WorktreeFileEntry>> {
    let directory = file_path(root, relative)?;
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(directory)? {
        let entry = entry?;
        if entry.file_name() == ".git" {
            continue;
        }
        if entries.len() >= 4000 {
            bail!("Directory exceeds the 4000 entry limit");
        }
        let kind = entry.file_type()?;
        let path = entry
            .path()
            .strip_prefix(root)?
            .to_string_lossy()
            .replace('\\', "/");
        entries.push(WorktreeFileEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path,
            is_dir: kind.is_dir(),
            is_symlink: kind.is_symlink(),
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then(a.name.cmp(&b.name))
    });
    Ok(entries)
}

pub fn read_file(root: &Path, relative: &str) -> Result<String> {
    let path = file_path(root, relative)?;
    if !path.is_file() {
        bail!("Select a regular text file");
    }
    let file = std::fs::File::open(path)?;
    let mut bytes = Vec::new();
    file.take(1024 * 1024 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > 1024 * 1024 {
        bail!("File exceeds the 1 MiB preview limit");
    }
    if bytes.contains(&0) {
        bail!("Binary files cannot be previewed");
    }
    String::from_utf8(bytes).context("File is not UTF-8 text")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn resolves_only_worktrees_of_the_registered_repository() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("main");
        let checkout = temp.path().join("topic checkout");
        let repo = git2::Repository::init(&root).unwrap();
        let signature = git2::Signature::now("Example", "user@example.invalid").unwrap();
        let tree_id = repo.index().unwrap().write_tree().unwrap();
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            "Initial",
            &repo.find_tree(tree_id).unwrap(),
            &[],
        )
        .unwrap();
        repo.worktree("topic", &checkout, None).unwrap();
        let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
        store
            .insert_project(&super::super::skill_store::ProjectRecord {
                id: "demo".into(),
                name: "Demo".into(),
                path: root.to_string_lossy().into_owned(),
                workspace_type: "project".into(),
                linked_agent_key: None,
                linked_agent_name: None,
                disabled_path: None,
                sort_order: 0,
                created_at: 0,
                updated_at: 0,
                visited_at: None,
            })
            .unwrap();
        assert_eq!(list(&store, "demo").unwrap().len(), 2);
        assert_eq!(
            directory(&store, "demo", Some(checkout.to_str().unwrap())).unwrap(),
            checkout.canonicalize().unwrap()
        );
        assert!(directory(&store, "demo", Some(temp.path().to_str().unwrap())).is_err());
        assert!(directory(&store, "missing", None).is_err());
        assert_eq!(list_directory(&checkout).unwrap().len(), 2);
        std::fs::create_dir(root.join("subdirectory")).unwrap();
        assert_eq!(list_directory(&root.join("subdirectory")).unwrap().len(), 1);
    }

    #[test]
    fn creates_from_selected_head_and_preserves_existing_data() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("main");
        let repo = git2::Repository::init(&root).unwrap();
        let signature = git2::Signature::now("Example", "user@example.invalid").unwrap();
        std::fs::write(root.join("readme.txt"), "committed").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("readme.txt")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let head = repo
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                "Initial",
                &repo.find_tree(tree_id).unwrap(),
                &[],
            )
            .unwrap();
        let store = SkillStore::new(&temp.path().join("store.db")).unwrap();
        store
            .insert_project(&super::super::skill_store::ProjectRecord {
                id: "demo".into(),
                name: "Demo".into(),
                path: root.to_string_lossy().into_owned(),
                workspace_type: "project".into(),
                linked_agent_key: None,
                linked_agent_name: None,
                disabled_path: None,
                sort_order: 0,
                created_at: 0,
                updated_at: 0,
                visited_at: None,
            })
            .unwrap();
        std::fs::write(root.join("readme.txt"), "keep local changes").unwrap();
        let target = temp.path().join("topic checkout");
        let tree = create(
            &store,
            "demo",
            root.to_str().unwrap(),
            "feature/topic",
            target.to_str().unwrap(),
        )
        .unwrap();
        assert_eq!(tree.branch.as_deref(), Some("feature/topic"));
        assert_eq!(tree.head, Some(head.to_string()));
        assert_eq!(
            std::fs::read_to_string(target.join("readme.txt")).unwrap(),
            "committed"
        );
        assert_eq!(
            std::fs::read_to_string(root.join("readme.txt")).unwrap(),
            "keep local changes"
        );
        assert_eq!(list(&store, "demo").unwrap().len(), 2);
        assert!(directory(&store, "demo", Some(&tree.path)).is_ok());
        // A detached linked checkout is also an authorized source.
        let linked = git2::Repository::open(&target).unwrap();
        let second_tree = linked.treebuilder(None).unwrap().write().unwrap();
        let second_head = linked
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                "Topic",
                &linked.find_tree(second_tree).unwrap(),
                &[&linked.find_commit(head).unwrap()],
            )
            .unwrap();
        linked.set_head_detached(second_head).unwrap();
        let second = temp.path().join("second");
        let created = create(
            &store,
            "demo",
            &tree.path,
            "second",
            second.to_str().unwrap(),
        )
        .unwrap();
        assert_eq!(created.head, Some(second_head.to_string()));
        let unused = temp.path().join("unused");
        for branch in ["feature/topic", "bad..branch", "-option", ""] {
            assert!(create(
                &store,
                "demo",
                root.to_str().unwrap(),
                branch,
                unused.to_str().unwrap()
            )
            .is_err());
            assert!(!unused.exists());
        }
        for destination in [
            target.clone(),
            root.join(".git/unsafe"),
            temp.path().join("missing/child"),
        ] {
            assert!(create(
                &store,
                "demo",
                root.to_str().unwrap(),
                "unused",
                destination.to_str().unwrap()
            )
            .is_err());
        }
        assert!(repo.find_branch("unused", git2::BranchType::Local).is_err());
        assert!(create(
            &store,
            "demo",
            temp.path().to_str().unwrap(),
            "outside",
            unused.to_str().unwrap()
        )
        .is_err());
        assert!(!unused.exists());
    }

    #[test]
    fn non_git_directories_still_have_a_workspace() {
        let temp = tempdir().unwrap();
        let worktrees = list_directory(temp.path()).unwrap();
        assert_eq!(worktrees.len(), 1);
        assert!(worktrees[0].is_main && worktrees[0].available);
        assert_eq!(worktrees[0].branch, None);
    }

    #[test]
    fn parses_detached_locked_and_missing_worktrees_with_literal_paths() {
        let records = parse_worktrees("worktree /workspace/main\0HEAD abc\0branch refs/heads/main\0\0worktree /workspace/topic\nbranch\0HEAD def\0detached\0locked reason\0prunable missing\0\0");
        assert_eq!(records.len(), 2);
        assert!(records[0].is_main);
        assert_eq!(records[0].branch.as_deref(), Some("main"));
        assert_eq!(records[1].path, "/workspace/topic\nbranch");
        assert_eq!(records[1].branch, None);
        assert!(records[1].locked);
        assert!(!records[1].available);
    }

    #[test]
    fn reads_directories_lazily_and_bounds_text_previews() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        std::fs::create_dir(root.join("src")).unwrap();
        std::fs::create_dir(root.join(".git")).unwrap();
        std::fs::write(root.join("readme.md"), "hello").unwrap();
        std::fs::write(root.join("src/large.txt"), vec![b'a'; 1024 * 1024 + 1]).unwrap();
        std::fs::write(root.join("src/binary"), [0, 1]).unwrap();
        let files = entries(root, "").unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].path, "src");
        assert!(files[0].is_dir);
        assert_eq!(read_file(root, "readme.md").unwrap(), "hello");
        assert!(read_file(root, "src/large.txt").is_err());
        assert!(read_file(root, "src/binary").is_err());
        assert!(entries(root, "../").is_err());
        assert!(read_file(root, "/etc/passwd").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_links_outside_the_selected_worktree() {
        let root = tempdir().unwrap();
        let other = tempdir().unwrap();
        std::fs::write(other.path().join("private"), "data").unwrap();
        std::os::unix::fs::symlink(other.path(), root.path().join("link")).unwrap();
        assert!(entries(root.path(), "link").is_err());
        assert!(read_file(root.path(), "link/private").is_err());
    }
}
