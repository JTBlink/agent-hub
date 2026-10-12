//! Remove dedicated entries, including native entries predating the manifest.
use super::*;

/// Remove a built-in Agent entry while retaining the project central content.
pub fn remove_target(
    root: &Path,
    name: &str,
    agent: &str,
) -> Result<ProjectLibraryStatus, AppError> {
    let adapter = super::super::tool_adapters::find_adapter(agent);
    remove(root, name, agent, adapter.as_ref())
}

/// Resolve unrecorded entries using the caller's authoritative custom adapter.
pub fn remove_target_with_adapter(
    root: &Path,
    name: &str,
    adapter: &ToolAdapter,
) -> Result<ProjectLibraryStatus, AppError> {
    remove(root, name, &adapter.key, Some(adapter))
}

fn remove(
    root: &Path,
    name: &str,
    agent: &str,
    adapter: Option<&ToolAdapter>,
) -> Result<ProjectLibraryStatus, AppError> {
    mutate(root, |root, lock| {
        let mut manifest = manifest::read(root)?;
        let entry = manifest
            .skills
            .get_mut(name)
            .context("Project Skill is not managed")?;
        let mut publication = Publication::new(root)?;
        if let Some(path) = entry.targets.get(agent).cloned() {
            ensure_dedicated(name, &path)?;
            let actual = actual_target(
                &path,
                entry.disabled || entry.disabled_targets.contains(agent),
            );
            check_replace(root, &actual, Some(&entry.content_hash), None)?;
            entry.targets.remove(agent);
            entry.disabled_targets.remove(agent);
            entry.linked_targets.remove(agent);
            if !entry.targets.values().any(|remaining| remaining == &path) {
                publication.add(root, actual, None, Some(&entry.content_hash))?;
            }
        } else {
            let adapter = adapter.context("Unknown project Agent")?;
            let path = target_paths(root, name, std::slice::from_ref(adapter))?
                .remove(agent)
                .context("Agent has no project Skills directory")?;
            ensure_dedicated(name, &path)?;
            if entry.targets.values().any(|recorded| recorded == &path) {
                bail!(
                    "Project entry is shared with another Agent; remove its recorded targets first"
                );
            }
            // Legacy entries may be active or disabled independently of the
            // central Skill. Stage both so a hidden duplicate cannot remain.
            for actual in [path.clone(), actual_target(&path, true)] {
                let target = entries::path(root, &actual)?;
                let baseline = entries::fingerprint_entry(&target)?;
                if baseline.is_none() {
                    continue;
                }
                if !target.is_symlink() {
                    check_replace(root, &actual, Some(&entry.content_hash), None)?;
                }
                // Explicit undeploy owns the link itself, including a legacy
                // personal or broken link. Never inspect/delete its destination.
                publication.add(root, actual, None, baseline.as_deref())?;
            }
        }
        publish_manifest(root, lock, publication, &manifest)
    })
}

fn ensure_dedicated(name: &str, path: &str) -> Result<()> {
    if path == canonical_path(name, false) || path == canonical_path(name, true) {
        bail!("Shared project library cannot be removed for one Agent");
    }
    Ok(())
}
