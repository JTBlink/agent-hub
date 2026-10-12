//! Portable project skills and team deployment, independent of a personal library.
mod git;
mod entries;
mod manifest;
mod transaction;

use anyhow::{bail, Context, Result};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};

use super::{
    error::AppError, installer, path_guard, skill_store::SkillRecord, tool_adapters::ToolAdapter,
};
pub use manifest::LIBRARY as SKILLS_DIRECTORY;
use manifest::{fingerprint, ProjectEntry, ProjectManifest, ProjectSource, LIBRARY, MANIFEST};
use transaction::{ProjectLock, Publication};

#[derive(Serialize)]
pub struct ProjectLibraryStatus {
    pub skills: Vec<ProjectLibrarySkill>,
    pub files_to_commit: Vec<String>,
    /// Optional for Agent consumption; shared only for AgentHub maintenance.
    pub management_files: Vec<String>,
    pub ignored_paths: Vec<String>,
}

#[derive(Serialize)]
pub struct ProjectLibrarySkill {
    pub name: String,
    pub directory: String,
    pub modified: bool,
    pub disabled: bool,
    pub targets: Vec<String>,
    pub stale_targets: Vec<String>,
}

/// Install actual content in the project and generate selected team targets.
/// Reinstall adds targets but never upgrades an existing project version.
pub fn install(
    root: &Path,
    skill: &SkillRecord,
    targets: &[ToolAdapter],
) -> Result<ProjectLibraryStatus, AppError> {
    mutate(root, |root, lock| {
        let name = super::sync_engine::target_dir_name(Path::new(&skill.central_path), &skill.name);
        safe_name(&name)?;
        let mut manifest = manifest::read(root)?;
        if manifest.skills.contains_key(&name) {
            return deploy_unlocked(root, lock, &mut manifest, &name, targets);
        }
        let staged = tempfile::tempdir()?;
        let content = staged.path().join("content");
        let _source_lock =
            super::repo_lock::RepoLock::acquire_foreground("copy project Skill source")?;
        installer::install_from_local_to_destination(
            Path::new(&skill.central_path),
            Some(&name),
            &content,
        )?;
        let hash = fingerprint(&content)?.context("Empty staged project Skill")?;
        let canonical = format!("{LIBRARY}/{name}");
        check_replace(root, &canonical, None, Some(&hash))?;
        let mut entry = ProjectEntry {
            id: uuid::Uuid::new_v4().to_string(),
            name: skill.name.clone(),
            content_hash: hash,
            targets: BTreeMap::new(),
            source: portable_source(skill),
            disabled: false,
            disabled_targets: BTreeSet::new(),
            linked_targets: BTreeSet::new(),
            extra: BTreeMap::new(),
        };
        let paths = target_paths(root, &name, targets)?;
        for (agent, path) in &paths {
            check_replace(root, path, None, Some(&entry.content_hash))?;
            entry.targets.insert(agent.clone(), path.clone());
        }
        let mut publication = Publication::new(root)?;
        publication.add(root, canonical.clone(), Some(&content), None)?;
        for path in unique_paths(paths.values()) {
            if path != canonical {
                publication.add(root, path, Some(&content), None)?;
            }
        }
        manifest.skills.insert(name, entry);
        publish_manifest(root, lock, publication, &manifest)
    })
}

/// Add team targets using project content, without reading a personal library.
pub fn deploy(
    root: &Path,
    name: &str,
    targets: &[ToolAdapter],
) -> Result<ProjectLibraryStatus, AppError> {
    mutate(root, |root, lock| {
        safe_name(name)?;
        let mut manifest = manifest::read(root)?;
        deploy_unlocked(root, lock, &mut manifest, name, targets)
    })
}

fn deploy_unlocked(
    root: &Path,
    lock: &ProjectLock,
    manifest: &mut ProjectManifest,
    name: &str,
    targets: &[ToolAdapter],
) -> Result<()> {
    let canonical = format!("{LIBRARY}/{name}");
    let content = safe_path(root, &canonical)?;
    if !super::skill_metadata::is_valid_skill_dir(&content) {
        bail!("Project library Skill not found");
    }
    let current = fingerprint(&content)?.context("Project library Skill not found")?;
    let entry = manifest
        .skills
        .entry(name.into())
        .or_insert_with(|| ProjectEntry {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.into(),
            content_hash: current.clone(),
            targets: BTreeMap::new(),
            source: None,
            disabled: false,
            disabled_targets: BTreeSet::new(),
            linked_targets: BTreeSet::new(),
            extra: BTreeMap::new(),
        });
    if entry.disabled {
        bail!("Project Skill is disabled; enable it before adding targets");
    }
    let paths = target_paths(root, name, targets)?;
    let snapshot = team_snapshot(&content, &current)?;
    let content = snapshot.path().join("content");
    let mut publication = Publication::new(root)?;
    publication.observe(canonical.clone(), Some(current.clone()));
    for path in unique_paths(paths.values()) {
        if path == canonical {
            continue;
        }
        let recorded = entry.targets.values().any(|existing| existing == &path);
        let disabled = entry
            .targets
            .iter()
            .any(|(key, existing)| existing == &path && entry.disabled_targets.contains(key));
        for (key, added_path) in &paths {
            if added_path == &path && disabled {
                entry.disabled_targets.insert(key.clone());
            }
        }
        let path = actual_target(&path, disabled);
        check_replace(
            root,
            &path,
            recorded.then_some(entry.content_hash.as_str()),
            Some(&current),
        )?;
        publication.add(
            root,
            path,
            Some(&content),
            recorded.then_some(entry.content_hash.as_str()),
        )?;
    }
    entry.targets.extend(paths);
    // Existing targets may still use the original baseline. Only repair of
    // every team target can advance the baseline after editing canonical.
    publish_manifest(root, lock, publication, manifest)
}

/// Update from an explicitly selected personal version, preserving project edits.
pub fn update(
    root: &Path,
    name: &str,
    skill: &SkillRecord,
) -> Result<ProjectLibraryStatus, AppError> {
    mutate(root, |root, lock| {
        safe_name(name)?;
        let mut manifest = manifest::read(root)?;
        let entry = manifest
            .skills
            .get_mut(name)
            .context("Project Skill is not managed; import it explicitly first")?;
        let staged = tempfile::tempdir()?;
        let content = staged.path().join("content");
        let _source_lock =
            super::repo_lock::RepoLock::acquire_foreground("copy project Skill source")?;
        installer::install_from_local_to_destination(
            Path::new(&skill.central_path),
            Some(name),
            &content,
        )?;
        let new_hash = fingerprint(&content)?.context("Empty staged project Skill")?;
        let canonical = canonical_path(name, entry.disabled);
        check_replace(root, &canonical, Some(&entry.content_hash), Some(&new_hash))?;
        let mut publication = Publication::new(root)?;
        for path in all_entry_paths(name, entry) {
            check_replace(root, &path, Some(&entry.content_hash), Some(&new_hash))?;
            publication.add(root, path, Some(&content), Some(&entry.content_hash))?;
        }
        entry.content_hash = new_hash;
        entry.source = portable_source(skill);
        publish_manifest(root, lock, publication, &manifest)
    })
}

/// Refresh all recorded team copies from project content. No source download.
pub fn repair(root: &Path, name: &str) -> Result<ProjectLibraryStatus, AppError> {
    mutate(root, |root, lock| {
        let mut manifest = manifest::read(root)?;
        let entry = manifest
            .skills
            .get_mut(name)
            .context("Project Skill is not managed")?;
        let canonical = canonical_path(name, entry.disabled);
        let content = safe_path(root, &canonical)?;
        let current = fingerprint(&content)?
            .context("Project library content missing; restore it from project Git")?;
        let snapshot = team_snapshot(&content, &current)?;
        let content = snapshot.path().join("content");
        let mut publication = Publication::new(root)?;
        publication.observe(canonical.clone(), Some(current.clone()));
        for path in all_entry_paths(name, entry) {
            if path == canonical {
                continue;
            }
            check_replace(root, &path, Some(&entry.content_hash), Some(&current))?;
            publication.add(root, path, Some(&content), Some(&entry.content_hash))?;
        }
        entry.content_hash = current;
        publish_manifest(root, lock, publication, &manifest)
    })
}

/// Shared project enable/disable, including every recorded team copy.
pub fn set_enabled(
    root: &Path,
    name: &str,
    enabled: bool,
) -> Result<ProjectLibraryStatus, AppError> {
    mutate(root, |root, lock| {
        let mut manifest = manifest::read(root)?;
        let entry = manifest
            .skills
            .get_mut(name)
            .context("Project Skill is not managed")?;
        if entry.disabled != enabled {
            return Ok(());
        }
        let old_paths = all_entry_paths(name, entry);
        let source = safe_path(root, &canonical_path(name, entry.disabled))?;
        let current = fingerprint(&source)?.context("Project library content missing")?;
        // Moves require all copies to agree; arbitrary local edits are never
        // discarded merely because the user toggled a shared project Skill.
        for path in &old_paths {
            check_replace(root, path, Some(&current), None)?;
        }
        let snapshot = team_snapshot(&source, &current)?;
        let source = snapshot.path().join("content");
        entry.disabled = !enabled;
        entry.disabled_targets.clear();
        let new_paths = all_entry_paths(name, entry);
        let mut publication = Publication::new(root)?;
        let unchanged: Vec<_> = old_paths
            .iter()
            .filter(|path| new_paths.contains(path))
            .cloned()
            .collect();
        for path in old_paths {
            if !unchanged.contains(&path) {
                publication.add(root, path, None, Some(&current))?;
            }
        }
        for path in new_paths {
            if unchanged.contains(&path) {
                continue;
            }
            check_replace(root, &path, None, Some(&current))?;
            publication.add(root, path, Some(&source), None)?;
        }
        entry.content_hash = current;
        publish_manifest(root, lock, publication, &manifest)
    })
}

/// Toggle a dedicated team entry without changing the canonical content.
/// A native public-directory target is necessarily shared across readers.
pub fn set_target_enabled(
    root: &Path,
    name: &str,
    agent: &str,
    enabled: bool,
) -> Result<ProjectLibraryStatus, AppError> {
    let manifest = manifest::read(root).map_err(AppError::io_with_context)?;
    if manifest
        .skills
        .get(name)
        .and_then(|entry| entry.targets.get(agent))
        .is_some_and(|path| path == &format!("{LIBRARY}/{name}"))
    {
        return set_enabled(root, name, enabled);
    }
    mutate(root, |root, lock| {
        let mut manifest = manifest::read(root)?;
        let entry = manifest
            .skills
            .get_mut(name)
            .context("Project Skill is not managed")?;
        if entry.disabled {
            if !enabled {
                return Ok(());
            }
            bail!("Shared project Skill is disabled; enable the project Skill first");
        }
        let path = entry
            .targets
            .get(agent)
            .context("Team target not found")?
            .clone();
        let disabled = entry.disabled_targets.contains(agent);
        if disabled != enabled {
            return Ok(());
        }
        let old = actual_target(&path, disabled);
        let new = actual_target(&path, !enabled);
        let source = safe_path(root, &old)?;
        let current = fingerprint(&source)?.context("Team entry missing; repair it first")?;
        check_replace(root, &new, None, Some(&current))?;
        let mut publication = Publication::new(root)?;
        publication.add(root, old, None, Some(&current))?;
        publication.add(root, new, Some(&source), None)?;
        let aliases: Vec<_> = entry
            .targets
            .iter()
            .filter(|(_, other)| *other == &path)
            .map(|(key, _)| key.clone())
            .collect();
        for key in aliases {
            if enabled {
                entry.disabled_targets.remove(&key);
            } else {
                entry.disabled_targets.insert(key);
            }
        }
        publish_manifest(root, lock, publication, &manifest)
    })
}

/// Remove the complete project Skill after the user selects project deletion.
pub fn remove(root: &Path, name: &str) -> Result<ProjectLibraryStatus, AppError> {
    mutate(root, |root, lock| {
        let mut manifest = manifest::read(root)?;
        let entry = manifest
            .skills
            .get(name)
            .context("Project Skill is not managed")?;
        let mut publication = Publication::new(root)?;
        for path in all_entry_paths(name, entry) {
            check_replace(root, &path, Some(&entry.content_hash), None)?;
            publication.add(root, path, None, Some(&entry.content_hash))?;
        }
        manifest.skills.remove(name);
        publish_manifest(root, lock, publication, &manifest)
    })
}

/// Remove one recorded dedicated target. Shared canonical content is retained.
pub fn remove_target(
    root: &Path,
    name: &str,
    agent: &str,
) -> Result<ProjectLibraryStatus, AppError> {
    mutate(root, |root, lock| {
        let mut manifest = manifest::read(root)?;
        let entry = manifest
            .skills
            .get_mut(name)
            .context("Project Skill is not managed")?;
        let Some(path) = entry.targets.get(agent).cloned() else {
            return Ok(());
        };
        if path == format!("{LIBRARY}/{name}") {
            bail!("Shared project library cannot be removed for one Agent");
        }
        let actual = actual_target(
            &path,
            entry.disabled || entry.disabled_targets.contains(agent),
        );
        check_replace(root, &actual, Some(&entry.content_hash), None)?;
        entry.targets.remove(agent);
        entry.disabled_targets.remove(agent);
        let mut publication = Publication::new(root)?;
        if !entry.targets.values().any(|remaining| remaining == &path) {
            publication.add(root, actual, None, Some(&entry.content_hash))?;
        }
        publish_manifest(root, lock, publication, &manifest)
    })
}

pub fn is_managed(root: &Path, name: &str) -> Result<bool, AppError> {
    manifest::read(root)
        .map(|manifest| manifest.skills.contains_key(name))
        .map_err(AppError::io_with_context)
}

/// Read portable state without creating directories or modifying project files.
pub fn status(root: &Path) -> Result<ProjectLibraryStatus, AppError> {
    let root = root.canonicalize().map_err(AppError::io)?;
    status_inner(&root).map_err(AppError::io_with_context)
}

fn status_inner(root: &Path) -> Result<ProjectLibraryStatus> {
    let manifest = manifest::read(root)?;
    let mut files = Vec::new();
    let mut management_files = Vec::new();
    let mut skills = Vec::new();
    if root.join(MANIFEST).is_file() {
        files.push(MANIFEST.into());
        management_files.push(MANIFEST.into());
    }
    for (directory, entry) in &manifest.skills {
        let canonical = canonical_path(directory, entry.disabled);
        let current = fingerprint(&safe_path(root, &canonical)?)?;
        let mut stale = Vec::new();
        for (agent, path) in &entry.targets {
            let path = actual_target(
                path,
                entry.disabled || entry.disabled_targets.contains(agent),
            );
            if fingerprint(&safe_path(root, &path)?)? != current {
                stale.push(agent.clone());
            }
        }
        files.extend(all_entry_paths(directory, entry));
        skills.push(ProjectLibrarySkill {
            name: entry.name.clone(),
            directory: directory.clone(),
            disabled: entry.disabled,
            modified: current.as_deref() != Some(&entry.content_hash),
            targets: entry.targets.keys().cloned().collect(),
            stale_targets: stale,
        });
    }
    if let Ok(repo) = git2::Repository::discover(root) {
        if let (Some(workdir), Ok(changes)) = (repo.workdir(), repo.statuses(None)) {
            for change in changes.iter().filter(|change| {
                change
                    .status()
                    .intersects(git2::Status::WT_DELETED | git2::Status::INDEX_DELETED)
            }) {
                if let Some(path) = change.path().and_then(|path| {
                    workdir
                        .join(path)
                        .strip_prefix(root)
                        .ok()
                        .map(Path::to_path_buf)
                }) {
                    let path = path
                        .to_string_lossy()
                        .replace(std::path::MAIN_SEPARATOR, "/");
                    // Only report removed Skill files, not unrelated project changes.
                    if path.ends_with("/SKILL.md") || path.ends_with("/skill.md") {
                        files.push(path);
                    }
                }
            }
        }
    }
    files.sort();
    files.dedup();
    let ignored_paths = git::ignored_paths(root, &files);
    Ok(ProjectLibraryStatus {
        skills,
        files_to_commit: files,
        management_files,
        ignored_paths,
    })
}

fn mutate(
    root: &Path,
    action: impl FnOnce(&Path, &ProjectLock) -> Result<()>,
) -> Result<ProjectLibraryStatus, AppError> {
    let _guard = super::project_skill_mutation::lock_project_skill_mutation()?;
    let root = root
        .canonicalize()
        .map_err(|err| AppError::io_with_context(err.into()))?;
    let result = (|| {
        let lock = ProjectLock::acquire(&root)?;
        transaction::recover(&root, &lock)?;
        action(&root, &lock)?;
        status_inner(&root)
    })();
    result.map_err(AppError::io_with_context)
}

pub(crate) fn safe_name(name: &str) -> Result<()> {
    path_guard::ensure_safe_skill_relative_path(name).map_err(|e| anyhow::anyhow!(e.message))?;
    if name.contains(['/', '\\', ':']) || name.starts_with('.') {
        bail!("Invalid project Skill directory name");
    }
    Ok(())
}

pub(crate) fn safe_path(root: &Path, relative: &str) -> Result<PathBuf> {
    let target = entries::path(root, relative)?;
    if !path_guard::is_path_safe(root, &target) {
        bail!("Project path escapes its workspace");
    }
    if target.is_symlink() {
        bail!("Project path contains a symbolic link; import or migrate explicitly");
    }
    Ok(target)
}

fn check_replace(
    root: &Path,
    path: &str,
    baseline: Option<&str>,
    desired: Option<&str>,
) -> Result<()> {
    let current = entries::content_fingerprint(root, path)?;
    if current.is_none() || current.as_deref() == desired || current.as_deref() == baseline {
        return Ok(());
    }
    bail!("Project content changed or is not managed: {path}. Existing files were preserved; review the differences first");
}

fn target_paths(
    root: &Path,
    name: &str,
    targets: &[ToolAdapter],
) -> Result<BTreeMap<String, String>> {
    if targets.is_empty() {
        bail!("Select at least one team Agent");
    }
    // Keep owned values explicit before safe_path borrows them as str.
    let mut paths: BTreeMap<String, String> = BTreeMap::new();
    for target in targets {
        let directory = target.project_relative_skills_dir();
        if directory.is_empty() {
            bail!("Agent has no project Skills directory");
        }
        let path = format!("{directory}/{name}");
        validate_target(root, name, &path)?;
        for existing in paths.values() {
            if existing != &path {
                path_guard::ensure_disjoint_paths(
                    &entries::path(root, existing)?,
                    &entries::path(root, &path)?,
                )
                .map_err(|err| anyhow::anyhow!(err.message))?;
            }
        }
        paths.insert(target.key.clone(), path);
    }
    Ok(paths)
}

pub(crate) fn validate_target(root: &Path, name: &str, path: &str) -> Result<()> {
    let target = entries::path(root, path)?;
    for relative in [
        canonical_path(name, false),
        canonical_path(name, true),
        MANIFEST.into(),
    ] {
        let reference = entries::path(root, &relative)?;
        if reference != target {
            path_guard::ensure_disjoint_paths(&reference, &target)
                .map_err(|err| anyhow::anyhow!(err.message))?;
        }
    }
    Ok(())
}

fn unique_paths<'a>(paths: impl Iterator<Item = &'a String>) -> Vec<String> {
    let mut result: Vec<_> = paths.cloned().collect();
    result.sort();
    result.dedup();
    result
}

fn canonical_path(name: &str, disabled: bool) -> String {
    format!(
        "{LIBRARY}{}/{name}",
        if disabled { "-disabled" } else { "" }
    )
}

fn actual_target(path: &str, disabled: bool) -> String {
    if !disabled {
        return path.into();
    }
    let (parent, name) = path.rsplit_once('/').expect("validated relative target");
    format!("{parent}-disabled/{name}")
}

fn all_entry_paths(name: &str, entry: &ProjectEntry) -> Vec<String> {
    let mut paths = vec![canonical_path(name, entry.disabled)];
    paths.extend(entry.targets.iter().map(|(agent, path)| {
        actual_target(
            path,
            entry.disabled || entry.disabled_targets.contains(agent),
        )
    }));
    paths.sort();
    paths.dedup();
    paths
}

fn team_snapshot(source: &Path, expected: &str) -> Result<tempfile::TempDir> {
    let snapshot = tempfile::tempdir()?;
    let content = snapshot.path().join("content");
    transaction::copy_project_content(source, &content)?;
    if fingerprint(source)?.as_deref() != Some(expected)
        || fingerprint(&content)?.as_deref() != Some(expected)
    {
        bail!("Project source changed while staging; no team files were replaced");
    }
    Ok(snapshot)
}

fn portable_source(skill: &SkillRecord) -> Option<ProjectSource> {
    if !matches!(skill.source_type.as_str(), "git" | "skillssh") {
        return None;
    }
    let url = skill.source_ref_resolved.as_ref()?;
    // Never export embedded credentials, local clone paths or filesystem URLs.
    let parsed = reqwest::Url::parse(url).ok()?;
    if !matches!(parsed.scheme(), "https" | "http")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return None;
    }
    Some(ProjectSource {
        source_type: skill.source_type.clone(),
        url: url.clone(),
        subpath: skill
            .source_subpath
            .clone()
            .filter(|path| path_guard::ensure_safe_skill_relative_path(path).is_ok()),
        branch: skill.source_branch.clone(),
        revision: if super::content_hash::hash_directory(Path::new(&skill.central_path))
            .ok()
            .as_ref()
            == skill.content_hash.as_ref()
        {
            skill.source_revision.clone()
        } else {
            None
        },
    })
}

fn publish_manifest(
    root: &Path,
    lock: &ProjectLock,
    mut publication: Publication,
    manifest: &ProjectManifest,
) -> Result<()> {
    let file = tempfile::NamedTempFile::new()?;
    let mut bytes = serde_json::to_vec_pretty(manifest)?;
    bytes.push(b'\n');
    fs::write(file.path(), bytes)?;
    publication.add(
        root,
        MANIFEST.into(),
        Some(file.path()),
        manifest.baseline.as_deref(),
    )?;
    publication.apply(root, lock)
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod compatibility_tests;
