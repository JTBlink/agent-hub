//! Center updates share the normal project transaction and path protections.
use super::*;

/// Update from the selected center version; force requires explicit overwrite consent.
pub fn update(
    root: &Path,
    name: &str,
    skill: &SkillRecord,
    force: bool,
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
            super::super::repo_lock::RepoLock::acquire_foreground("copy project Skill source")?;
        installer::install_from_local_to_destination(
            Path::new(&skill.central_path),
            Some(name),
            &content,
        )?;
        let new_hash = fingerprint(&content)?.context("Empty staged project Skill")?;
        let canonical = canonical_path(name, entry.disabled);
        let baseline = entry.content_hash.clone();
        let mut publication = Publication::new(root)?;
        for path in all_entry_paths(name, entry) {
            if path != canonical && !entries::is_present(root, &path)? {
                continue;
            }
            let before = check_update_replace(root, &path, &baseline, &new_hash, force)?;
            installation::publish_target(
                &mut publication,
                root,
                entry,
                path,
                &canonical,
                &content,
                before.as_deref(),
            )?;
        }
        entry.content_hash = new_hash;
        entry.source = portable_source(skill);
        publish_manifest(root, lock, publication, &manifest)
    })
}

fn check_update_replace(
    root: &Path,
    relative: &str,
    baseline: &str,
    desired: &str,
    force: bool,
) -> Result<Option<String>> {
    let target = entries::path(root, relative)?;
    let before = entries::fingerprint_entry(&target)?;
    let current = entries::content_fingerprint(root, relative)?;
    if force
        && before.is_some()
        && !target.is_symlink()
        && !super::super::skill_metadata::is_valid_skill_dir(&target)
    {
        bail!("Project target is not a Skill directory; existing files were preserved: {relative}");
    }
    if !force
        && current.is_some()
        && current.as_deref() != Some(baseline)
        && current.as_deref() != Some(desired)
    {
        return Err(AppError::project_restore_required(
            "Project skill has local changes; confirm before restoring the Skills Center version",
        )
        .into());
    }
    if before != entries::fingerprint_entry(&target)? {
        bail!(
            "Project changed while checking restoration; existing files were preserved: {relative}"
        );
    }
    Ok(before)
}
